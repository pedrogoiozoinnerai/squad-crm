import "server-only";

import { lerIdentidade, salaDaReuniao } from "@/lib/livekit";
import {
  atingiuPresenca,
  consolidar,
  tetoDaPresenca,
  veredicto,
  type PresencaConsolidada,
  type RegraDePresenca,
} from "@/lib/presenca";
import { prisma } from "@/lib/prisma";

/// Teto por execução. Uma reconciliação que tenta processar meses de uma vez
/// estoura o tempo da função serverless e não termina nunca.
const POR_EXECUCAO = 200;

/** A configuração, criando a linha única na primeira vez. */
export async function configuracao() {
  return prisma.config.upsert({ where: { id: "unica" }, update: {}, create: {} });
}

export type RelatorioDeReconciliacao = {
  reunioes: number;
  participaram: number;
  naoCompareceram: number;
  semDados: number;
  presencas: number;
  negociosAtualizados: number;
  assentosAtualizados: number;
};

/**
 * Deriva a presença dos eventos crus. Idempotente de ponta a ponta: rodar de
 * novo sobre os mesmos eventos dá exatamente o mesmo resultado, e rodar depois
 * de um evento atrasado chegar corrige sozinho.
 *
 * É a camada 2 das três. A 1 é o webhook (`/api/livekit/webhook`), a 3 é o
 * painel de monitoramento, que avisa quando a 1 parou de chegar.
 */
export async function reconciliarPresencas(
  agora = new Date(),
  opcoes: { janelaDias?: number; meetingId?: string } = {},
): Promise<RelatorioDeReconciliacao> {
  const regra = await configuracao();
  const desde = new Date(agora.getTime() - (opcoes.janelaDias ?? 7) * 24 * 60 * 60 * 1000);

  // Eventos que chegaram sem reunião amarrada — sala criada antes da reunião
  // existir, ou corrida entre o webhook e a gravação do agendamento.
  await amarrarEventosSoltos(desde);

  const reunioes = await prisma.meeting.findMany({
    where: opcoes.meetingId
      ? { id: opcoes.meetingId }
      : {
          endsAt: { gte: desde, lte: agora },
          status: { not: "CANCELED" },
          // Sessão sem inscrito, sem lead e sem um único evento de sala não
          // tem o que reconciliar: o veredicto seria "sem dados", que não
          // escreve nada. Antes da agenda de 13 horários por dia isso eram
          // quatro linhas por semana; agora seriam ~78, cada uma com um
          // `findMany` e uma transação, dentro de uma função de 60 segundos.
          //
          // `roomEvents` fica na condição de propósito: quem entrou numa sala
          // sem estar no roster É informação, e sumir com ela aqui apagaria
          // justamente o caso que a camada de presença existe para mostrar.
          OR: [
            { attendees: { some: {} } },
            { leadId: { not: null } },
            { roomEvents: { some: {} } },
          ],
        },
    select: { id: true, startsAt: true, endsAt: true, status: true, dealId: true },
    orderBy: { endsAt: "desc" },
    take: POR_EXECUCAO,
  });

  const relatorio: RelatorioDeReconciliacao = {
    reunioes: 0,
    participaram: 0,
    naoCompareceram: 0,
    semDados: 0,
    presencas: 0,
    negociosAtualizados: 0,
    assentosAtualizados: 0,
  };

  for (const reuniao of reunioes) {
    const eventos = await prisma.roomEvent.findMany({
      where: { meetingId: reuniao.id },
      select: { type: true, at: true, identity: true, name: true },
      orderBy: { at: "asc" },
    });

    relatorio.reunioes += 1;

    const encerrada = eventos.find((e) => e.type === "room_finished");
    // O teto: nada depois de `endsAt + 30 min` acumula. Sem ele, uma sala
    // esquecida aberta a noite inteira vira presença — medimos 366 minutos
    // numa call de 45.
    const consolidadas = consolidar(
      eventos,
      encerrada?.at ?? null,
      tetoDaPresenca(reuniao.endsAt),
    );
    const duracaoSegundos = Math.max(
      0,
      Math.round((reuniao.endsAt.getTime() - reuniao.startsAt.getTime()) / 1000),
    );

    // Recria as presenças desta reunião do zero. É o que garante que o
    // resultado seja função só dos eventos: sem sobra de uma execução antiga
    // com dados que já não valem.
    await prisma.$transaction([
      prisma.presence.deleteMany({ where: { meetingId: reuniao.id } }),
      ...consolidadas.map((p) => {
        const quem = lerIdentidade(p.identity);
        return prisma.presence.create({
          data: {
            meetingId: reuniao.id,
            identity: p.identity,
            name: p.name,
            userId: quem.tipo === "usuario" ? quem.id : null,
            leadId: quem.tipo === "lead" ? quem.id : null,
            joinedAt: p.joinedAt,
            leftAt: p.leftAt,
            seconds: p.seconds,
          },
        });
      }),
    ]);
    relatorio.presencas += consolidadas.length;

    const resultado = veredicto(consolidadas, eventos.length > 0, duracaoSegundos, regra);

    if (resultado.situacao === "sem_dados") {
      // NÃO escreve nada. Sem evento não há o que afirmar sobre quem apareceu,
      // e marcar no-show aqui seria inventar. Fica visível no monitoramento.
      relatorio.semDados += 1;
      continue;
    }

    // A presença medida chega ao ROSTER.
    //
    // Sem isto, `MeetingAttendee.attended` e `totalSeconds` ficavam no zero do
    // `@default` para sempre — e a tela de Sessões, cujo texto diz "presença
    // aqui não é checkbox: a sala mede o tempo real de cada inscrito",
    // mostrava 0% para todo mundo. O schema já chamava estas colunas de
    // DERIVADAS; faltava quem as derivasse.
    relatorio.assentosAtualizados += await projetarNoRoster(
      reuniao.id,
      consolidadas,
      duracaoSegundos,
      regra,
    );

    const status = resultado.situacao === "participou" ? "DONE" : "NO_SHOW";
    if (reuniao.status !== status) {
      await prisma.meeting.update({ where: { id: reuniao.id }, data: { status } });
    }
    if (resultado.situacao === "participou") relatorio.participaram += 1;
    else relatorio.naoCompareceram += 1;

    // A presença medida chega ao negócio. Era o elo que faltava: a sala sabia
    // quem esteve na call, e o `attendance` do pipeline continuava sendo
    // digitado à mão num select.
    //
    // `attendanceManual` trava a derivação. Se o vendedor corrigiu, o número
    // dele vence o nosso — ele estava lá, e pode ter havido reunião por
    // telefone que sala nenhuma registra.
    if (reuniao.dealId) {
      const presenca = resultado.situacao === "participou" ? "PARTICIPOU" : "NAO_COMPARECEU";
      const mudou = await prisma.deal.updateMany({
        where: {
          id: reuniao.dealId,
          attendanceManual: false,
          attendance: { not: presenca },
        },
        data: { attendance: presenca, attendanceAt: agora },
      });
      relatorio.negociosAtualizados += mudou.count;
    }
  }

  return relatorio;
}

/**
 * Liga à reunião os eventos que chegaram sem ela.
 *
 * O nome da sala já carrega o id (`reuniao-<id>`), então é só resolver — mas
 * o webhook pode ter chegado antes da reunião existir no banco.
 */
async function amarrarEventosSoltos(desde: Date) {
  const soltos = await prisma.roomEvent.findMany({
    where: { meetingId: null, createdAt: { gte: desde }, room: { startsWith: "reuniao-" } },
    select: { id: true, room: true },
    take: 1000,
  });
  if (soltos.length === 0) return;

  const ids = [...new Set(soltos.map((e) => e.room.slice("reuniao-".length)))];
  const existem = new Set(
    (await prisma.meeting.findMany({ where: { id: { in: ids } }, select: { id: true } })).map(
      (m) => m.id,
    ),
  );

  for (const evento of soltos) {
    const meetingId = evento.room.slice("reuniao-".length);
    if (!existem.has(meetingId)) continue;
    await prisma.roomEvent.update({ where: { id: evento.id }, data: { meetingId } });
  }
}

export type SaudeDoLiveKit = {
  configurado: boolean;
  ultimoEvento: Date | null;
  eventos24h: number;
  /// Reuniões que já acabaram e não têm um único evento de sala. É o número
  /// que denuncia webhook desligado — o equivalente das 1.028 participações
  /// pendentes do CRM de referência, só que visível.
  semDados: number;
  salasAtivas: number;
};

/**
 * O estado da camada 1. Uma integração que depende de alguém colar uma URL no
 * painel de um terceiro precisa dizer, sozinha, se aquilo foi feito.
 */
export async function saudeDoLiveKit(agora = new Date()): Promise<Omit<SaudeDoLiveKit, "configurado">> {
  const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
  const semanaPassada = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [ultimo, eventos24h, terminadas, comEvento, iniciadas, encerradas] = await Promise.all([
    prisma.roomEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.roomEvent.count({ where: { createdAt: { gte: ontem } } }),
    prisma.meeting.findMany({
      // Mesmo recorte de `reunioesSemDados`: sessão sem ninguém inscrito não é
      // falha de coleta, e contá-la aqui inflaria "sem dados" em ~78 por
      // semana desde que a agenda do funil abre 13 horários por dia.
      where: {
        endsAt: { gte: semanaPassada, lte: agora },
        status: { not: "CANCELED" },
        OR: [{ attendees: { some: {} } }, { leadId: { not: null } }],
      },
      select: { id: true },
    }),
    prisma.roomEvent.groupBy({
      by: ["meetingId"],
      where: { meetingId: { not: null }, at: { gte: semanaPassada } },
    }),
    prisma.roomEvent.count({ where: { type: "room_started", at: { gte: ontem } } }),
    prisma.roomEvent.count({ where: { type: "room_finished", at: { gte: ontem } } }),
  ]);

  const comDados = new Set(comEvento.map((e) => e.meetingId));
  return {
    ultimoEvento: ultimo?.createdAt ?? null,
    eventos24h,
    semDados: terminadas.filter((m) => !comDados.has(m.id)).length,
    salasAtivas: Math.max(0, iniciadas - encerradas),
  };
}

/**
 * Leva o tempo medido para a linha do inscrito.
 *
 * Duas regras que parecem detalhe e não são:
 *
 * NUNCA cria linha. Quem entrou na sala sem estar no roster — um convidado
 * que o lead trouxe, alguém com o link repassado — aparece em `Presence`, que
 * é a verdade crua, e não vira inscrito. Criar aqui inflaria a lotação e a
 * taxa de presença com gente que ninguém inscreveu.
 *
 * Quem estava no roster e NÃO apareceu é zerado, não deixado como estava. A
 * reunião teve dados; o silêncio dele é informação, não ausência dela. Sem
 * isso, um valor de uma execução antiga sobreviveria a uma correção dos
 * eventos — e o painel mostraria presença de quem faltou.
 *
 * Só roda quando houve evento de sala: com `sem_dados` a função nem é chamada.
 */
async function projetarNoRoster(
  meetingId: string,
  consolidadas: PresencaConsolidada[],
  duracaoSegundos: number,
  regra: RegraDePresenca,
) {
  const assentos = await prisma.meetingAttendee.findMany({
    where: { meetingId },
    select: { id: true, leadId: true },
  });
  if (assentos.length === 0) return 0;

  // Um lead pode entrar de dois aparelhos: o tempo é a soma, e a primeira
  // entrada e a última saída delimitam a permanência.
  const porLead = new Map<string, PresencaConsolidada[]>();
  for (const p of consolidadas) {
    const quem = lerIdentidade(p.identity);
    if (quem.tipo !== "lead") continue;
    const lista = porLead.get(quem.id) ?? [];
    lista.push(p);
    porLead.set(quem.id, lista);
  }

  let atualizados = 0;

  for (const assento of assentos) {
    const dele = porLead.get(assento.leadId) ?? [];
    const segundos = dele.reduce((soma, p) => soma + p.seconds, 0);
    const entradas = dele.reduce((soma, p) => soma + p.joinCount, 0);

    const primeira = dele.length
      ? new Date(Math.min(...dele.map((p) => p.joinedAt.getTime())))
      : null;
    // Só há última saída se TODAS fecharam: uma em aberto significa que a
    // pessoa ainda estava lá quando os dados terminaram.
    const saidas = dele.map((p) => p.leftAt);
    const ultima =
      dele.length && saidas.every((s): s is Date => s !== null)
        ? new Date(Math.max(...saidas.map((s) => s.getTime())))
        : null;

    const esteve = atingiuPresenca(segundos, duracaoSegundos, regra);

    const r = await prisma.meetingAttendee.updateMany({
      where: { id: assento.id },
      data: {
        joinedAt: primeira,
        leftAt: ultima,
        joinCount: entradas,
        totalSeconds: segundos,
        attended: esteve,
        // A régua que produziu ESTE veredicto. Mudar o mínimo de 5 para 8 não
        // pode reescrever a história em silêncio — é o mesmo princípio de
        // `AiPrompt` guardar a versão que gerou cada análise.
        regraMinutos: regra.presencaMinutos,
      },
    });
    atualizados += r.count;
  }

  return atualizados;
}

/** O nome da sala de uma reunião. Reexportado para as telas não importarem duas coisas. */
export { salaDaReuniao };
