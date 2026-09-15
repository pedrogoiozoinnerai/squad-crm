import "server-only";

import { nextDealCode } from "@/lib/codes";
import { prisma } from "@/lib/prisma";
import { readFunnelLeads, type FunnelLead } from "@/lib/type-funnel";

/**
 * Espelha o Funil do Type dentro do CRM.
 *
 * Roda pelo cron e pelo botão da tela de importação — o mesmo código nos dois,
 * porque duas implementações divergem no dia em que alguém corrige só uma.
 *
 * Idempotente por `typeLeadId`. Cada passagem reconcilia o estado inteiro em
 * vez de aplicar eventos: quem já existe é atualizado, quem agendou depois
 * ganha a reunião, quem cancelou tem a reunião cancelada e uma tarefa aberta.
 * Reconciliar em vez de reagir significa que uma execução perdida não deixa o
 * CRM permanentemente errado — a próxima conserta.
 */
export type ResultadoSync = {
  lidos: number;
  leadsCriados: number;
  negociosCriados: number;
  reunioesCriadas: number;
  reunioesCanceladas: number;
  reunioesRemarcadas: number;
  tarefasCriadas: number;
};

const vazio = (): ResultadoSync => ({
  lidos: 0,
  leadsCriados: 0,
  negociosCriados: 0,
  reunioesCriadas: 0,
  reunioesCanceladas: 0,
  reunioesRemarcadas: 0,
  tarefasCriadas: 0,
});

/**
 * Vendedores no rodízio: conta assumida por uma pessoa de verdade e ativa.
 *
 * As contas importadas do HubSpot ficam de fora até alguém assumi-las — mandar
 * lead novo para uma conta em que ninguém entra é o mesmo que descartá-lo.
 */
async function vendedoresNoRodizio() {
  const ativos = await prisma.user.findMany({
    where: { active: true, claimedAt: { not: null } },
    select: { id: true, name: true, role: true },
    orderBy: { createdAt: "asc" },
  });
  const vendedores = ativos.filter((u) => u.role === "USER");
  // Só admin no sistema (começo de vida): ele recebe, em vez de tudo cair no
  // limbo do "Não atribuído" no primeiro dia de operação.
  return vendedores.length > 0 ? vendedores : ativos;
}

/** Conta de aterrissagem quando ninguém assumiu conta ainda. */
async function naoAtribuido() {
  const existente = await prisma.user.findUnique({
    where: { email: "nao-atribuido@innerai.com" },
    select: { id: true },
  });
  if (existente) return existente.id;
  const criado = await prisma.user.create({
    data: { email: "nao-atribuido@innerai.com", name: "Não atribuído", passwordHash: "", active: false },
    select: { id: true },
  });
  return criado.id;
}

const MEIA_HORA = 30 * 60_000;

export async function sincronizarFunil(agora = new Date()): Promise<ResultadoSync> {
  const r = vazio();
  const linhas = await readFunnelLeads();
  r.lidos = linhas.length;
  if (!linhas.length) return r;

  const [vendedores, semDono, primeiraEtapa] = await Promise.all([
    vendedoresNoRodizio(),
    naoAtribuido(),
    prisma.stage.findFirst({ orderBy: { order: "asc" } }),
  ]);
  if (!primeiraEtapa) throw new Error("Nenhuma etapa de pipeline configurada.");

  // Rodízio sem contador próprio: a posição sai de quantos leads do funil já
  // entraram. Determinístico, distribui parelho e não precisa de tabela nova
  // nem sobrevive errado a um deploy no meio do caminho.
  let posicao = await prisma.lead.count({ where: { source: { startsWith: "funil_type" } } });
  const proximoDono = () => {
    if (!vendedores.length) return semDono;
    return vendedores[posicao++ % vendedores.length].id;
  };

  for (const linha of linhas) {
    await sincronizarUm(linha, { r, agora, primeiraEtapaId: primeiraEtapa.id, proximoDono });
  }
  return r;
}

async function sincronizarUm(
  linha: FunnelLead,
  ctx: { r: ResultadoSync; agora: Date; primeiraEtapaId: string; proximoDono: () => string },
) {
  const { r, agora, primeiraEtapaId, proximoDono } = ctx;

  const agendadoEm = linha.scheduledAt ? new Date(linha.scheduledAt) : null;
  const cancelado = Boolean(linha.calCancelledAt);
  const temAgenda = agendadoEm !== null && !Number.isNaN(agendadoEm.getTime()) && !linha.semAgendamento;

  const existente = await prisma.lead.findUnique({
    where: { typeLeadId: linha.id },
    include: { deals: { select: { id: true, ownerId: true }, orderBy: { createdAt: "asc" }, take: 1 } },
  });

  const dados = {
    name: linha.fullName ?? "Sem nome",
    email: linha.email,
    phone: linha.phoneE164,
    company: linha.company,
    jobTitle: linha.role,
    segment: linha.segment,
    revenueRange: linha.revenueRange,
    utmSource: linha.utmSource,
    utmMedium: linha.utmMedium,
    utmCampaign: linha.utmCampaign,
    // A origem distingue quem agendou de quem parou no último passo. É o que
    // permite ao time filtrar "respondeu tudo e não marcou horário", que é a
    // fila mais quente do funil.
    source: temAgendamento(linha) ? "funil_type" : "funil_type_sem_agenda",
  };

  const lead = existente
    ? await prisma.lead.update({ where: { id: existente.id }, data: dados })
    : await prisma.lead.create({
        data: {
          ...dados,
          status: (linha.phoneE164 || linha.email) && linha.company ? "COMPLETE" : "INCOMPLETE",
          typeLeadId: linha.id,
          typeSessionId: linha.sessionId,
          ownerId: proximoDono(),
          createdAt: linha.createdAt ? new Date(linha.createdAt) : agora,
        },
      });
  if (!existente) r.leadsCriados++;

  // ─── Negócio ───────────────────────────────────────────────────────────
  let dealId = existente?.deals[0]?.id;
  let donoDoNegocio = existente?.deals[0]?.ownerId;
  if (!dealId) {
    const dono = lead.ownerId ?? proximoDono();
    const criado = await prisma.deal.create({
      data: {
        code: await nextDealCode(),
        leadId: lead.id,
        stageId: primeiraEtapaId,
        valueCents: 0,
        probability: 20,
        ownerId: dono,
        createdAt: linha.createdAt ? new Date(linha.createdAt) : agora,
      },
      select: { id: true, ownerId: true },
    });
    dealId = criado.id;
    donoDoNegocio = criado.ownerId;
    r.negociosCriados++;

    await prisma.activity.create({
      data: {
        kind: "DEAL_CREATED",
        title: `Negócio criado em ${temAgendamento(linha) ? "agendamento pelo funil" : "funil sem agendamento"}`,
        detail: linha.utmSource ? `Origem: ${linha.utmSource}` : null,
        authorId: dono,
        leadId: lead.id,
        dealId: criado.id,
      },
    });
  }

  const dono = donoDoNegocio ?? lead.ownerId ?? proximoDono();

  // ─── Reunião ───────────────────────────────────────────────────────────
  // Remarcar no Cal cria uma reserva NOVA, com uid novo. Procurar só pelo uid
  // atual não acharia a reunião anterior e nasceria uma segunda — duas
  // reuniões ativas na agenda do vendedor, para o mesmo lead, no mesmo dia.
  // Por isso o segundo tiro: qualquer reunião deste lead que tenha vindo do
  // Cal é a mesma reunião, só que remarcada.
  const reuniao =
    (linha.calBookingUid
      ? await prisma.meeting.findUnique({ where: { calBookingUid: linha.calBookingUid } })
      : null) ??
    (await prisma.meeting.findFirst({
      where: { leadId: lead.id, calBookingUid: { not: null } },
      orderBy: { startsAt: "desc" },
    }));

  if (temAgenda && agendadoEm && !cancelado) {
    if (!reuniao) {
      await prisma.meeting.create({
        data: {
          title: `Diagnóstico · ${lead.name}`,
          startsAt: agendadoEm,
          endsAt: new Date(agendadoEm.getTime() + MEIA_HORA),
          type: "ONE_ON_ONE",
          ownerId: dono,
          leadId: lead.id,
          calBookingUid: linha.calBookingUid,
          location: linha.meetingLocation,
        },
      });
      r.reunioesCriadas++;
    } else if (
      reuniao.startsAt.getTime() !== agendadoEm.getTime() ||
      reuniao.status === "CANCELED" ||
      reuniao.calBookingUid !== linha.calBookingUid
    ) {
      // Remarcou — inclusive quem havia cancelado e voltou.
      await prisma.meeting.update({
        where: { id: reuniao.id },
        data: {
          startsAt: agendadoEm,
          endsAt: new Date(agendadoEm.getTime() + MEIA_HORA),
          status: "SCHEDULED",
          location: linha.meetingLocation,
          // O uid muda a cada remarcação; sem atualizá-lo, a próxima passagem
          // perderia o rastro e criaria a reunião duplicada de novo.
          calBookingUid: linha.calBookingUid,
        },
      });
      r.reunioesRemarcadas++;
    }
  }

  if (cancelado && reuniao && reuniao.status !== "CANCELED") {
    await prisma.meeting.update({ where: { id: reuniao.id }, data: { status: "CANCELED" } });
    r.reunioesCanceladas++;

    // A tarefa é o ponto da coisa: sem ela o vendedor só descobre o
    // cancelamento quando olhar a agenda, e até lá o lead esfriou.
    const jaTem = await prisma.task.findFirst({
      where: { leadId: lead.id, status: "PENDING", subject: { startsWith: "Retomar contato" } },
    });
    if (!jaTem) {
      await prisma.task.create({
        data: {
          subject: `Retomar contato — ${lead.name} cancelou a reunião`,
          type: "message",
          priority: "HIGH",
          status: "PENDING",
          dueAt: new Date(agora.getTime() + 2 * 60 * 60_000),
          ownerId: dono,
          leadId: lead.id,
          dealId,
          automated: true,
        },
      });
      r.tarefasCriadas++;
    }
  }

  // Agendou: a cobrança de agendamento perde o sentido. Deixá-la pendente faz
  // o vendedor ligar para cobrar horário de quem já marcou — e some a confiança
  // na fila de tarefas, que é o que o time olha de manhã.
  // Agendou (ou remarcou): as duas cobranças automáticas perdem o sentido.
  // Deixá-las pendentes faz o vendedor ligar para cobrar horário de quem já
  // marcou — e some a confiança na fila de tarefas, que é o que o time olha
  // de manhã. Só as automáticas: tarefa escrita por gente ninguém fecha.
  if (temAgendamento(linha)) {
    await prisma.task.updateMany({
      where: {
        leadId: lead.id,
        status: "PENDING",
        automated: true,
        OR: [{ subject: { startsWith: "Primeiro contato —" } }, { subject: { startsWith: "Retomar contato —" } }],
      },
      data: { status: "DONE", completedAt: agora },
    });
  }

  // ─── Quem respondeu tudo e não marcou horário ──────────────────────────
  if (!temAgendamento(linha) && !existente) {
    await prisma.task.create({
      data: {
        subject: `Primeiro contato — ${lead.name} respondeu o funil sem agendar`,
        type: "message",
        priority: "HIGH",
        status: "PENDING",
        dueAt: new Date(agora.getTime() + 60 * 60_000),
        ownerId: dono,
        leadId: lead.id,
        dealId,
        automated: true,
      },
    });
    r.tarefasCriadas++;
  }
}

/** Agendou e não desmarcou. */
function temAgendamento(linha: FunnelLead) {
  return !linha.semAgendamento && !linha.calCancelledAt;
}
