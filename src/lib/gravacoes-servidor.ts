import "server-only";

import { armazenamentoConfigurado } from "@/lib/armazenamento";
import { derivarGravacao, type SituacaoDaGravacao } from "@/lib/gravacao";
import { salaDaReuniao } from "@/lib/identidades";
import { normalizarEgress } from "@/lib/livekit";
import { chamarLiveKit, livekitConfigurado } from "@/lib/livekit-servidor";
import { prisma } from "@/lib/prisma";

/**
 * A gravação, conferida contra o LiveKit em vez de contra a nossa memória.
 *
 * O webhook é o caminho rápido, e ele falha: os eventos de egress precisam ser
 * cadastrados no painel do LiveKit, e hoje só os quatro de sala estão lá. Foi
 * exatamente um passo esquecido num painel que deixou 1.028 participações
 * perdidas no CRM de referência — e uma gravação perdida é pior, porque o
 * arquivo existe, é cobrado, e ninguém sabe que ele está lá.
 *
 * Esta função não confia em nada que já esteja no nosso banco: ela pergunta ao
 * LiveKit o que aconteceu com as salas das reuniões recentes e deriva daí,
 * pelas mesmas funções puras que o webhook usa. Rodar de novo devolve o mesmo.
 */

/// Quantos dias para trás olhar.
///
/// Três: cobre o fim de semana inteiro caso o cron pare na sexta, e é curto o
/// bastante para a varredura ser uma consulta pequena. O LiveKit guarda o
/// histórico de egress por bem mais tempo que isso.
const DIAS = 3;

/// Quanto esperar depois do fim da reunião antes de cobrar a gravação.
///
/// Meia hora. O egress fecha o arquivo e sobe 550 MB depois que a sala esvazia,
/// e cobrar antes disso marcaria como falha toda call que acabou de terminar.
const CARENCIA_MIN = 30;

export type RelatorioDeGravacoes = {
  reunioes: number;
  criadas: number;
  atualizadas: number;
  /// Terminaram há tempo, a sala existiu, e o LiveKit não tem egress nenhum.
  /// É o número que denuncia o webhook mal cadastrado — ou a gravação
  /// desligada sem ninguém perceber.
  semGravacao: number;
  falhas: number;
};

type EgressBruto = Record<string, unknown>;

export async function conciliarGravacoes(agora = new Date()): Promise<RelatorioDeGravacoes> {
  const relatorio: RelatorioDeGravacoes = {
    reunioes: 0,
    criadas: 0,
    atualizadas: 0,
    semGravacao: 0,
    falhas: 0,
  };

  if (!livekitConfigurado() || !armazenamentoConfigurado()) return relatorio;

  const desde = new Date(agora.getTime() - DIAS * 24 * 60 * 60_000);
  const ate = new Date(agora.getTime() - CARENCIA_MIN * 60_000);

  const reunioes = await prisma.meeting.findMany({
    where: {
      endsAt: { gte: desde, lte: ate },
      status: { not: "CANCELED" },
      // Sem ninguém na sala não houve gravação, e perguntar ao LiveKit por
      // cada horário vago da agenda seriam centenas de chamadas por execução
      // para descobrir que não aconteceu nada.
      presences: { some: {} },
    },
    select: { id: true, gravacoes: { select: { egressId: true, status: true } } },
    take: 200,
  });

  for (const reuniao of reunioes) {
    relatorio.reunioes += 1;

    const jaFinalizadas = reuniao.gravacoes.every((g) => ehFinal(g.status));
    if (reuniao.gravacoes.length > 0 && jaFinalizadas) continue;

    let itens: EgressBruto[];
    try {
      const resposta = await chamarLiveKit(
        "livekit.Egress/ListEgress",
        { roomName: salaDaReuniao(reuniao.id) },
        { roomRecord: true },
      );
      itens = Array.isArray(resposta.items) ? (resposta.items as EgressBruto[]) : [];
    } catch (erro) {
      relatorio.falhas += 1;
      console.error(`[gravacoes] ListEgress falhou para ${reuniao.id}:`, erro);
      continue;
    }

    if (itens.length === 0) {
      if (reuniao.gravacoes.length === 0) relatorio.semGravacao += 1;
      continue;
    }

    for (const item of itens) {
      // `ListEgress` devolve o `EgressInfo` solto; `normalizarEgress` espera o
      // envelope do webhook. Montar o envelope aqui é o que permite as duas
      // portas usarem exatamente o mesmo leitor — e uma divergência entre elas
      // seria o pior tipo de defeito: a conciliação "consertando" gravações
      // com dados diferentes dos que o webhook grava.
      const egress = normalizarEgress({
        event: "egress_updated",
        id: `conciliacao-${String(item.egressId ?? "")}`,
        createdAt: String(Math.floor(agora.getTime() / 1000)),
        egressInfo: item,
      });
      if (!egress) continue;

      const atual = await prisma.recording.findUnique({
        where: { egressId: egress.egressId },
        select: {
          status: true, caminho: true, bytes: true, duracaoSegundos: true,
          iniciadaEm: true, terminadaEm: true, erro: true,
        },
      });

      const derivada = derivarGravacao(egress, {
        ...atual,
        bytes: atual?.bytes != null ? Number(atual.bytes) : null,
      });

      const dados = {
        status: derivada.status,
        caminho: derivada.caminho,
        bytes: derivada.bytes != null ? BigInt(Math.round(derivada.bytes)) : null,
        duracaoSegundos: derivada.duracaoSegundos,
        iniciadaEm: derivada.iniciadaEm,
        terminadaEm: derivada.terminadaEm,
        erro: derivada.erro,
        bruto: item as object,
      };

      await prisma.recording.upsert({
        where: { egressId: egress.egressId },
        create: { egressId: egress.egressId, meetingId: reuniao.id, ...dados },
        update: dados,
      });
      if (atual) relatorio.atualizadas += 1;
      else relatorio.criadas += 1;
    }
  }

  return relatorio;
}

function ehFinal(status: SituacaoDaGravacao) {
  return status === "COMPLETA" || status === "FALHOU" || status === "ABORTADA" || status === "APAGADA";
}
