import "server-only";

import { addDays } from "date-fns";

import { weekStart } from "@/lib/dates";

import { ownerScope, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Reuniões da semana, já no escopo do usuário. */
export async function getWeekMeetings(user: SessionUser, start: Date) {
  return prisma.meeting.findMany({
    where: {
      ...ownerScope(user),
      startsAt: { gte: start, lt: addDays(start, 7) },
      status: { not: "CANCELED" },
    },
    include: {
      lead: { select: { id: true, name: true, company: true, score: true } },
      owner: { select: { id: true, name: true } },
    },
    orderBy: { startsAt: "asc" },
  });
}

export async function getLeads(user: SessionUser) {
  return prisma.lead.findMany({
    where: ownerScope(user),
    include: { owner: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPipeline(user: SessionUser) {
  const [stages, deals] = await Promise.all([
    prisma.stage.findMany({ orderBy: { order: "asc" } }),
    prisma.deal.findMany({
      where: { ...ownerScope(user), status: "OPEN" },
      include: {
        lead: { select: { id: true, name: true, company: true, phone: true, score: true } },
        owner: { select: { name: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return { stages, deals };
}

export async function getTasks(user: SessionUser) {
  return prisma.task.findMany({
    where: ownerScope(user),
    include: {
      lead: { select: { name: true, phone: true } },
      deal: { select: { code: true, stage: { select: { name: true, color: true } } } },
      owner: { select: { name: true } },
    },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
  });
}

export async function getUsers() {
  return prisma.user.findMany({
    include: { _count: { select: { leads: true, deals: true, tasks: true } } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
}

/** Lista de possíveis responsáveis — só o admin usa. */
export async function getOwners() {
  return prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Detalhe do lead para o drawer, já respeitando o escopo do usuário. */
export async function getLeadDetail(user: SessionUser, id: string) {
  return prisma.lead.findFirst({
    where: { id, ...ownerScope(user) },
    include: {
      deal: { select: { id: true } },
      activities: {
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 40,
      },
      noteEntries: {
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 40,
      },
    },
  });
}

/** Detalhe do negócio para o drawer. */
export async function getDealDetail(user: SessionUser, id: string) {
  return prisma.deal.findFirst({
    where: { id, ...ownerScope(user) },
    include: {
      lossReason: true,
      lead: {
        include: {
          // A próxima reunião alimenta o bloco de agendamento do drawer.
          meetings: {
            where: { status: { not: "CANCELED" } },
            orderBy: { startsAt: "asc" },
            take: 1,
          },
        },
      },
      stage: true,
      owner: { select: { name: true } },
      tasks: { orderBy: [{ status: "asc" }, { dueAt: "asc" }] },
      activities: {
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 40,
      },
      noteEntries: {
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 40,
      },
    },
  });
}

export async function getStages() {
  return prisma.stage.findMany({ orderBy: { order: "asc" } });
}

/** Tabela completa de negócios (tela Deals), com busca e filtro por status. */
export async function getAllDeals(
  user: SessionUser,
  filters: { q?: string; status?: string },
) {
  const q = filters.q?.trim();

  return prisma.deal.findMany({
    where: {
      ...ownerScope(user),
      ...(filters.status && filters.status !== "all"
        ? { status: filters.status as "OPEN" | "WON" | "LOST" }
        : {}),
      ...(q
        ? {
            lead: {
              OR: [
                { name: { contains: q } },
                { email: { contains: q } },
                { phone: { contains: q } },
                { company: { contains: q } },
              ],
            },
          }
        : {}),
    },
    include: {
      lead: { select: { name: true, company: true, email: true } },
      stage: { select: { name: true, color: true } },
      owner: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
}

/** Agenda pessoal do dia: reuniões + tarefas com prazo. */
export async function getAgenda(user: SessionUser, day: Date) {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);

  const [meetings, tasks] = await Promise.all([
    prisma.meeting.findMany({
      where: { ...ownerScope(user), startsAt: { gte: start, lt: end }, status: { not: "CANCELED" } },
      include: { lead: { select: { name: true, company: true } } },
      orderBy: { startsAt: "asc" },
    }),
    prisma.task.findMany({
      where: { ...ownerScope(user), dueAt: { gte: start, lt: end } },
      include: { lead: { select: { name: true } } },
      orderBy: { dueAt: "asc" },
    }),
  ]);

  return { meetings, tasks };
}


/**
 * Cases sugeridos dentro do negócio: os do setor do lead primeiro (match
 * exato), completando com outros para o closer nunca ficar sem prova social.
 */
export async function getRelevantCases(segment: string | null) {
  const all = await prisma.case.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });

  return all
    .map((item) => ({ ...item, exact: segment !== null && item.segment === segment }))
    .sort((a, b) => Number(b.exact) - Number(a.exact));
}


export async function getLossReasons() {
  return prisma.lossReason.findMany({
    where: { active: true },
    orderBy: { orderIndex: "asc" },
  });
}

/**
 * Números do Dashboard. Cada bloco é uma agregação própria — nunca derivada de
 * uma página — para o total não mudar conforme o usuário navega.
 */
export async function getDashboard(user: SessionUser) {
  const scope = ownerScope(user);

  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const inicioSemana = weekStart(agora);
  const fimSemana = addDays(inicioSemana, 7);

  const [
    stages,
    abertosPorEtapa,
    ganhosMes,
    perdidosMes,
    perdasPorMotivo,
    motivos,
    tarefas,
    leadsPorStatus,
    reunioesSemana,
    porCloser,
  ] = await Promise.all([
    prisma.stage.findMany({ orderBy: { order: "asc" } }),

    prisma.deal.groupBy({
      by: ["stageId"],
      where: { ...scope, status: "OPEN" },
      _count: true,
      _sum: { valueCents: true },
    }),

    prisma.deal.aggregate({
      where: { ...scope, status: "WON", wonAt: { gte: inicioMes } },
      _count: true,
      _sum: { valueCents: true },
    }),

    prisma.deal.aggregate({
      where: { ...scope, status: "LOST", lostAt: { gte: inicioMes } },
      _count: true,
      _sum: { valueCents: true },
    }),

    prisma.deal.groupBy({
      by: ["lossReasonId"],
      where: { ...scope, status: "LOST" },
      _count: true,
      _sum: { valueCents: true },
    }),

    prisma.lossReason.findMany(),

    prisma.task.findMany({
      where: { ...scope, status: "PENDING" },
      select: { id: true, dueAt: true, automated: true },
    }),

    prisma.lead.groupBy({
      by: ["status"],
      where: scope,
      _count: true,
    }),

    prisma.meeting.count({
      where: { ...scope, startsAt: { gte: inicioSemana, lt: fimSemana }, status: { not: "CANCELED" } },
    }),

    user.role === "ADMIN"
      ? prisma.deal.groupBy({
          by: ["ownerId"],
          where: { status: "OPEN" },
          _count: true,
          _sum: { valueCents: true },
        })
      : Promise.resolve([]),
  ]);

  // Ponderado precisa do valor × probabilidade linha a linha, não do total.
  const abertos = await prisma.deal.findMany({
    where: { ...scope, status: "OPEN" },
    select: { valueCents: true, probability: true, expectedAt: true },
  });

  const pipelineBruto = abertos.reduce((s, d) => s + d.valueCents, 0);
  const pipelinePonderado = Math.round(
    abertos.reduce((s, d) => s + d.valueCents * (d.probability / 100), 0),
  );
  const previstoMes = Math.round(
    abertos
      .filter((d) => d.expectedAt && d.expectedAt >= inicioMes && d.expectedAt < addDays(inicioMes, 31))
      .reduce((s, d) => s + d.valueCents * (d.probability / 100), 0),
  );

  const nomes = user.role === "ADMIN" ? await getOwners() : [];

  const funil = stages.map((stage) => {
    const linha = abertosPorEtapa.find((a) => a.stageId === stage.id);
    return {
      id: stage.id,
      name: stage.name,
      color: stage.color,
      targetRole: stage.targetRole,
      count: linha?._count ?? 0,
      valueCents: linha?._sum.valueCents ?? 0,
    };
  });

  const perdas = perdasPorMotivo
    .map((p) => ({
      motivo: motivos.find((m) => m.id === p.lossReasonId)?.name ?? "Sem motivo registrado",
      count: p._count,
      valueCents: p._sum.valueCents ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  const vencidas = tarefas.filter((t) => t.dueAt && t.dueAt < agora).length;

  return {
    pipelineBruto,
    pipelinePonderado,
    previstoMes,
    ganhosMes: { count: ganhosMes._count, valueCents: ganhosMes._sum.valueCents ?? 0 },
    perdidosMes: { count: perdidosMes._count, valueCents: perdidosMes._sum.valueCents ?? 0 },
    funil,
    perdas,
    tarefas: {
      pendentes: tarefas.length,
      vencidas,
      automaticas: tarefas.filter((t) => t.automated).length,
    },
    leads: Object.fromEntries(leadsPorStatus.map((l) => [l.status, l._count])) as Record<string, number>,
    reunioesSemana,
    ranking: porCloser
      .map((c) => ({
        nome: nomes.find((n) => n.id === c.ownerId)?.name ?? "—",
        count: c._count,
        valueCents: c._sum.valueCents ?? 0,
      }))
      .sort((a, b) => b.valueCents - a.valueCents),
  };
}
