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

/**
 * Teto por coluna nas telas que listam.
 *
 * Com a base do HubSpot dentro, "trazer tudo" são 8.347 leads e 8.551 negócios
 * abertos: 5 MB e 6 MB de payload a cada carregamento, e um board com 6.397
 * cartões numa coluna só. O teto é por coluna, e o total vem do banco — assim
 * o número no cabeçalho continua verdadeiro mesmo mostrando uma fatia.
 */
const POR_COLUNA = 60;

const STATUS_LEAD = ["INCOMPLETE", "COMPLETE", "CONVERTED"] as const;

export async function getLeads(user: SessionUser) {
  const escopo = ownerScope(user);

  const [totais, fatias] = await Promise.all([
    prisma.lead.groupBy({ by: ["status"], where: escopo, _count: true }),
    Promise.all(
      STATUS_LEAD.map((status) =>
        prisma.lead.findMany({
          where: { ...escopo, status },
          include: { owner: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: POR_COLUNA,
        }),
      ),
    ),
  ]);

  const porStatus = new Map(totais.map((t) => [t.status, t._count]));
  return {
    leads: fatias.flat(),
    totais: Object.fromEntries(STATUS_LEAD.map((s) => [s, porStatus.get(s) ?? 0])) as Record<
      (typeof STATUS_LEAD)[number],
      number
    >,
  };
}

export async function getPipeline(user: SessionUser) {
  const escopo = { ...ownerScope(user), status: "OPEN" as const };
  const stages = await prisma.stage.findMany({ orderBy: { order: "asc" } });

  // Soma e contagem saem de um groupBy sobre a etapa inteira. Somar o que veio
  // na fatia daria um valor de pipeline menor que o real — e um número de
  // previsão errado é pior do que número nenhum.
  const [totais, fatias] = await Promise.all([
    prisma.deal.groupBy({ by: ["stageId"], where: escopo, _count: true, _sum: { valueCents: true } }),
    Promise.all(
      stages.map((stage) =>
        prisma.deal.findMany({
          where: { ...escopo, stageId: stage.id },
          include: {
            lead: { select: { id: true, name: true, company: true, phone: true, score: true } },
            owner: { select: { name: true } },
            _count: { select: { tasks: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: POR_COLUNA,
        }),
      ),
    ),
  ]);

  const porEtapa = new Map(totais.map((t) => [t.stageId, t]));
  return {
    stages: stages.map((stage) => ({
      ...stage,
      total: porEtapa.get(stage.id)?._count ?? 0,
      valueCents: porEtapa.get(stage.id)?._sum.valueCents ?? 0,
    })),
    deals: fatias.flat(),
  };
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
      // Vários negócios por lead: renovação, upsell, segunda compra. Mais
      // recente primeiro, que é o que o time procura ao abrir o drawer.
      deals: {
        select: { id: true, code: true, status: true, valueCents: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
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
/** Teto da lista de negócios: busca estreita o resultado, não a rolagem. */
const LISTA_NEGOCIOS = 300;

/** O filtro, isolado: a lista e a exportação têm de enxergar o mesmo conjunto. */
function filtroDeals(user: SessionUser, filters: { q?: string; status?: string }) {
  const q = filters.q?.trim();

  return {
    ...ownerScope(user),
    ...(filters.status && filters.status !== "all"
      ? { status: filters.status as "OPEN" | "WON" | "LOST" }
      : {}),
    ...(q
      ? {
          lead: {
            OR: [
              // `insensitive` importa desde que há dado de gente de verdade:
              // sem ele, procurar "joão" não encontra "João".
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q } },
              { company: { contains: q, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };
}

export async function getAllDeals(
  user: SessionUser,
  filters: { q?: string; status?: string },
) {
  const where = filtroDeals(user, filters);

  // Contagem e somas vêm do filtro inteiro, não das 300 linhas carregadas —
  // senão o cabeçalho anuncia "300 resultados · R$ 72 mil" para uma busca que
  // casou com 9 mil negócios e R$ 15 milhões.
  const [deals, agregado, ganho] = await Promise.all([
    prisma.deal.findMany({
      where,
      include: {
        lead: { select: { name: true, company: true, email: true } },
        stage: { select: { name: true, color: true } },
        owner: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: LISTA_NEGOCIOS,
    }),
    prisma.deal.aggregate({ where, _count: true, _sum: { valueCents: true } }),
    prisma.deal.aggregate({ where: { ...where, status: "WON" }, _sum: { valueCents: true } }),
  ]);

  return {
    deals,
    total: agregado._count,
    valueCents: agregado._sum.valueCents ?? 0,
    wonCents: ganho._sum.valueCents ?? 0,
  };
}

/**
 * Exportação: o filtro inteiro, sem o teto da tela.
 *
 * Reaproveitar `getAllDeals` aqui faria o CSV sair com 300 linhas de 9.504 sem
 * avisar ninguém — o pior tipo de erro, porque o arquivo parece completo.
 */
export async function getDealsParaExportar(
  user: SessionUser,
  filters: { q?: string; status?: string },
) {
  return prisma.deal.findMany({
    where: filtroDeals(user, filters),
    include: {
      lead: { select: { name: true, company: true, email: true } },
      stage: { select: { name: true, color: true } },
      owner: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
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

// ─────────────────────────── Sessões coletivas ───────────────────────────

/** Sessões num intervalo, com presença agregada a partir do tempo real. */
export async function getSessions(user: SessionUser, from: Date, to: Date) {
  const instances = await prisma.sessionInstance.findMany({
    where: { ...ownerScope(user), date: { gte: from, lt: to } },
    include: {
      owner: { select: { id: true, name: true } },
      template: { select: { name: true } },
      participants: {
        include: { lead: { select: { id: true, name: true, company: true, score: true } } },
        orderBy: { totalSeconds: "desc" },
      },
    },
    orderBy: [{ date: "asc" }, { time: "asc" }],
  });

  return instances.map((s) => {
    const inscritos = s.participants.length;
    const presentes = s.participants.filter((p) => p.attended).length;
    return {
      ...s,
      inscritos,
      presentes,
      taxaPresenca: inscritos ? Math.round((presentes / inscritos) * 100) : 0,
      qualificados: s.participants.filter(
        (p) => p.attended && (p.lead.score === "A" || p.lead.score === "B"),
      ).length,
    };
  });
}

export async function getSessionDetail(user: SessionUser, id: string) {
  return prisma.sessionInstance.findFirst({
    where: { id, ...ownerScope(user) },
    include: {
      owner: { select: { name: true } },
      template: { select: { name: true } },
      participants: {
        include: {
          lead: {
            select: { id: true, name: true, company: true, email: true, score: true, segment: true },
          },
        },
        orderBy: [{ attended: "desc" }, { totalSeconds: "desc" }],
      },
    },
  });
}

// ───────────────────────────── Participantes ─────────────────────────────

/** Leads inscritos em sessões — a base de "quem foi agendado". */
export async function getParticipants(
  user: SessionUser,
  filters: { q?: string; presenca?: string; score?: string },
) {
  const q = filters.q?.trim();

  return prisma.sessionParticipant.findMany({
    where: {
      sessionInstance: ownerScope(user),
      ...(filters.presenca === "presente" ? { attended: true } : {}),
      ...(filters.presenca === "ausente" ? { attended: false } : {}),
      lead: {
        ...(filters.score && filters.score !== "all" ? { score: filters.score } : {}),
        ...(q
          ? { OR: [{ name: { contains: q } }, { email: { contains: q } }, { company: { contains: q } }] }
          : {}),
      },
    },
    include: {
      lead: {
        select: { id: true, name: true, email: true, phone: true, company: true, segment: true, score: true },
      },
      sessionInstance: {
        select: { id: true, date: true, time: true, owner: { select: { name: true } } },
      },
    },
    orderBy: { sessionInstance: { date: "desc" } },
    take: 300,
  });
}

// ─────────────────────────── Painel do líder ───────────────────────────

/** Visão do time: quem está onde, com o que trava a operação hoje. */
export async function getTeamOverview() {
  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const inicioSemana = weekStart(agora);

  const [closers, ganhos, abertos, tarefas, reunioes, instancias] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.deal.groupBy({
      by: ["ownerId"],
      where: { status: "WON", wonAt: { gte: inicioMes } },
      _count: true,
      _sum: { valueCents: true },
    }),
    prisma.deal.groupBy({
      by: ["ownerId"],
      where: { status: "OPEN" },
      _count: true,
      _sum: { valueCents: true },
    }),
    prisma.task.findMany({
      where: { status: "PENDING" },
      select: { ownerId: true, dueAt: true },
    }),
    prisma.meeting.groupBy({
      by: ["ownerId"],
      where: { startsAt: { gte: inicioSemana }, status: { not: "CANCELED" } },
      _count: true,
    }),
    prisma.whatsappInstance.findMany({ select: { ownerId: true, status: true } }),
  ]);

  const linhas = closers.map((c) => {
    const g = ganhos.find((x) => x.ownerId === c.id);
    const a = abertos.find((x) => x.ownerId === c.id);
    const minhas = tarefas.filter((t) => t.ownerId === c.id);
    const whats = instancias.find((w) => w.ownerId === c.id);

    return {
      id: c.id,
      name: c.name,
      email: c.email,
      role: c.role,
      ganhoCents: g?._sum.valueCents ?? 0,
      ganhos: g?._count ?? 0,
      pipelineCents: a?._sum.valueCents ?? 0,
      abertos: a?._count ?? 0,
      pendentes: minhas.length,
      atrasadas: minhas.filter((t) => t.dueAt && t.dueAt < agora).length,
      reunioesSemana: reunioes.find((m) => m.ownerId === c.id)?._count ?? 0,
      whatsapp: whats?.status ?? null,
    };
  });

  return {
    linhas: linhas.sort((a, b) => b.ganhoCents - a.ganhoCents),
    totalGanhoCents: linhas.reduce((s, l) => s + l.ganhoCents, 0),
    totalGanhos: linhas.reduce((s, l) => s + l.ganhos, 0),
    totalAtrasadas: linhas.reduce((s, l) => s + l.atrasadas, 0),
    whatsappOff: linhas.filter((l) => l.whatsapp && l.whatsapp !== "connected").length,
  };
}

// ───────────────────── Configuração da operação ─────────────────────

export async function getConfig() {
  const [stages, lossReasons, templates, automations, cases, permissions] = await Promise.all([
    prisma.stage.findMany({ orderBy: { order: "asc" }, include: { _count: { select: { deals: true } } } }),
    prisma.lossReason.findMany({ orderBy: { orderIndex: "asc" }, include: { _count: { select: { deals: true } } } }),
    prisma.taskTemplate.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { tasks: true } } } }),
    prisma.taskAutomation.findMany({
      include: { template: { select: { name: true } }, targetStage: { select: { name: true, color: true } } },
    }),
    prisma.case.findMany({ orderBy: { segment: "asc" } }),
    prisma.rolePermission.findMany({ orderBy: { role: "asc" } }),
  ]);

  return { stages, lossReasons, templates, automations, cases, permissions };
}
