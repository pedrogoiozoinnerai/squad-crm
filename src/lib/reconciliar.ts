import "server-only";

import { lerIdentidade, salaDaReuniao } from "@/lib/livekit";
import { consolidar, veredicto } from "@/lib/presenca";
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
        },
    select: { id: true, startsAt: true, endsAt: true, status: true },
    orderBy: { endsAt: "desc" },
    take: POR_EXECUCAO,
  });

  const relatorio: RelatorioDeReconciliacao = {
    reunioes: 0,
    participaram: 0,
    naoCompareceram: 0,
    semDados: 0,
    presencas: 0,
  };

  for (const reuniao of reunioes) {
    const eventos = await prisma.roomEvent.findMany({
      where: { meetingId: reuniao.id },
      select: { type: true, at: true, identity: true, name: true },
      orderBy: { at: "asc" },
    });

    relatorio.reunioes += 1;

    const encerrada = eventos.find((e) => e.type === "room_finished");
    const consolidadas = consolidar(eventos, encerrada?.at ?? null);
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

    const status = resultado.situacao === "participou" ? "DONE" : "NO_SHOW";
    if (reuniao.status !== status) {
      await prisma.meeting.update({ where: { id: reuniao.id }, data: { status } });
    }
    if (resultado.situacao === "participou") relatorio.participaram += 1;
    else relatorio.naoCompareceram += 1;
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
      where: { endsAt: { gte: semanaPassada, lte: agora }, status: { not: "CANCELED" } },
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

/** O nome da sala de uma reunião. Reexportado para as telas não importarem duas coisas. */
export { salaDaReuniao };
