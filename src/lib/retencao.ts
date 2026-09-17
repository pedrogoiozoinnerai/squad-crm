import "server-only";

import { lerErros, lerObjecoes, redigirErros, redigirObjecoes, venceu } from "@/lib/analise";
import { apagarDoBucket, armazenamentoConfigurado } from "@/lib/armazenamento";
import { prisma } from "@/lib/prisma";

/**
 * Apagar o que passou do prazo.
 *
 * Duas coisas com prazos diferentes, de propósito: o VÍDEO é a conversa inteira
 * de um cliente e é o que pesa 550 MB; a TRANSCRIÇÃO é o que sustenta o resumo e
 * a auditoria depois que o arquivo já foi embora. Guardar o texto por mais
 * tempo que o vídeo é o que permite manter o histórico de desempenho do time
 * sem manter o rosto e a voz de quem comprou.
 *
 * **Os dois prazos nascem em 0, que significa guardar para sempre.** Não é
 * descuido: é decisão de quem responde por privacidade, e apagar material de
 * vendas por omissão seria pior que qualquer atraso em decidir. Enquanto o
 * número não for posto na tela de configurações, esta varredura não apaga nada.
 */

/// Quantos arquivos apagar por execução. Apagar é irreversível: um teto baixo
/// é o que transforma um prazo digitado errado — 9 em vez de 90 — num susto de
/// vinte arquivos em vez de uma base inteira antes de alguém perceber.
const POR_EXECUCAO = 20;

export type RelatorioDeRetencao = {
  videosApagados: number;
  transcricoesRedigidas: number;
  falhas: number;
};

export async function varrerRetencao(agora = new Date()): Promise<RelatorioDeRetencao> {
  const relatorio: RelatorioDeRetencao = {
    videosApagados: 0,
    transcricoesRedigidas: 0,
    falhas: 0,
  };

  const config = await prisma.config.findUnique({
    where: { id: "unica" },
    select: { retencaoVideoDias: true, retencaoTranscricaoDias: true },
  });
  if (!config) return relatorio;

  if (config.retencaoVideoDias > 0 && armazenamentoConfigurado()) {
    const gravacoes = await prisma.recording.findMany({
      where: { status: "COMPLETA", apagadaEm: null, caminho: { not: null } },
      select: { id: true, caminho: true, createdAt: true, terminadaEm: true },
      orderBy: { createdAt: "asc" },
      take: POR_EXECUCAO * 4,
    });

    for (const g of gravacoes) {
      if (relatorio.videosApagados >= POR_EXECUCAO) break;
      // A data de referência é quando a call ACONTECEU, não quando a linha foi
      // criada: uma gravação descoberta pela conciliação três dias depois não
      // pode ganhar três dias de sobrevida por causa disso.
      if (!venceu(g.terminadaEm ?? g.createdAt, config.retencaoVideoDias, agora)) continue;

      const foi = await apagarDoBucket(g.caminho!);
      if (!foi) {
        // A linha SÓ é marcada quando o arquivo saiu de verdade. Marcar antes
        // faria o banco dizer "apagado" sobre um vídeo que continua no bucket,
        // e ninguém voltaria a tentar.
        relatorio.falhas += 1;
        continue;
      }

      await prisma.recording.update({
        where: { id: g.id },
        // `caminho` fica: ele é o nome do arquivo, não o conteúdo, e é o que
        // permite conferir depois que aquilo realmente saiu do bucket.
        data: { status: "APAGADA", apagadaEm: agora },
      });
      relatorio.videosApagados += 1;
    }
  }

  if (config.retencaoTranscricaoDias > 0) {
    const transcricoes = await prisma.transcript.findMany({
      where: { texto: { not: "" } },
      select: {
        id: true,
        createdAt: true,
        analise: { select: { id: true, erros: true, objecoes: true, redigidaEm: true } },
      },
      orderBy: { createdAt: "asc" },
      take: POR_EXECUCAO * 4,
    });

    let feitas = 0;
    for (const t of transcricoes) {
      if (feitas >= POR_EXECUCAO) break;
      if (!venceu(t.createdAt, config.retencaoTranscricaoDias, agora)) continue;

      await prisma.$transaction([
        // O texto e os trechos vão embora; a linha fica, porque é ela que
        // explica por que existe uma análise sem transcrição para conferir.
        prisma.transcript.update({
          where: { id: t.id },
          data: { texto: "", segmentos: undefined, falantes: undefined },
        }),
        ...(t.analise
          ? [
              prisma.callAnalysis.update({
                where: { id: t.analise.id },
                data: {
                  // Os NÚMEROS ficam: a nota de fechamento de julho continua
                  // comparável com a de agosto. O que sai é a fala literal de
                  // quem esteve na call.
                  erros: redigirErros(lerErros(t.analise.erros)),
                  objecoes: redigirObjecoes(lerObjecoes(t.analise.objecoes)),
                  bruto: undefined,
                  redigidaEm: agora,
                },
              }),
            ]
          : []),
      ]);
      feitas += 1;
    }
    relatorio.transcricoesRedigidas = feitas;
  }

  return relatorio;
}

export type Esquecimento = {
  lead: string;
  anotacoes: number;
  mensagens: number;
  presencas: number;
  /// Gravações de reunião 1:1 em que este lead era a única pessoa de fora.
  /// Essas dá para apagar sem tirar nada de ninguém.
  gravacoesApagadas: number;
  /// Sessões COLETIVAS em que a pessoa aparece. **Não são apagadas.** Apagar a
  /// gravação de trinta pessoas a pedido de uma não tem resposta técnica — é
  /// decisão de quem responde por privacidade, e este número existe para que
  /// ela seja tomada com o tamanho do problema à vista, não no escuro.
  coletivasPendentes: number;
};

/**
 * Apaga os dados de uma pessoa a pedido dela.
 *
 * Faz o que tem resposta e DEVOLVE o que não tem. O pedido de exclusão numa
 * sessão de grupo é o caso aberto: o arquivo contém trinta pessoas, e apagá-lo
 * a pedido de uma destrói o material das outras vinte e nove — inclusive de
 * quem comprou. Este código não decide isso sozinho; ele conta quantas são e
 * deixa a decisão com quem pode tomá-la.
 */
export async function esquecerLead(leadId: string, agora = new Date()): Promise<Esquecimento> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, name: true },
  });
  if (!lead) throw new Error("Lead não encontrado.");

  const identidade = `l_${leadId}`;

  const reunioes = await prisma.meeting.findMany({
    where: { OR: [{ leadId }, { attendees: { some: { leadId } } }] },
    select: {
      id: true,
      type: true,
      _count: { select: { attendees: true } },
      gravacoes: { select: { id: true, caminho: true, apagadaEm: true } },
    },
  });

  let gravacoesApagadas = 0;
  let coletivasPendentes = 0;

  for (const reuniao of reunioes) {
    // Só 1:1 com esta pessoa. Uma "coletiva" com um inscrito só também conta:
    // o que decide é quantas pessoas estão no arquivo, não o rótulo do tipo.
    const soDela = reuniao.type === "ONE_ON_ONE" || reuniao._count.attendees <= 1;
    if (!soDela) {
      if (reuniao.gravacoes.some((g) => !g.apagadaEm)) coletivasPendentes += 1;
      continue;
    }
    for (const g of reuniao.gravacoes) {
      if (g.apagadaEm || !g.caminho) continue;
      if (!(await apagarDoBucket(g.caminho))) continue;
      await prisma.recording.update({
        where: { id: g.id },
        data: { status: "APAGADA", apagadaEm: agora },
      });
      gravacoesApagadas += 1;
    }
  }

  const [anotacoes, mensagens, presencas] = await prisma.$transaction([
    prisma.note.deleteMany({ where: { leadId } }),
    // As mensagens dela no chat das salas. Ficam pelo `identity`, que é o que
    // liga a mensagem à pessoa mesmo quando o nome digitado era outro.
    prisma.roomMessage.deleteMany({ where: { identity: identidade } }),
    // A presença some com o NOME e o vínculo; a linha em si seria recriada
    // pela reconciliação a partir dos eventos crus, então ela vai inteira.
    prisma.presence.deleteMany({ where: { OR: [{ leadId }, { identity: identidade }] } }),
  ]);

  return {
    lead: lead.name,
    anotacoes: anotacoes.count,
    mensagens: mensagens.count,
    presencas: presencas.count,
    gravacoesApagadas,
    coletivasPendentes,
  };
}
