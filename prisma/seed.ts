import "dotenv/config";

import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./dev.db" }),
});

const STAGES = [
  { key: "novo", name: "Novo", order: 1, color: "#a8a29e", targetRole: "SDR" },
  { key: "contatado", name: "Contatado", order: 2, color: "#e8912d", targetRole: "SDR" },
  { key: "demo_agendada", name: "Demo agendada", order: 3, color: "#0ea5e9", targetRole: "CLOSER" },
  { key: "proposta", name: "Proposta", order: 4, color: "#8b5cf6", targetRole: "CLOSER" },
  { key: "fechamento", name: "Fechamento", order: 5, color: "#2dc86a", targetRole: "CLOSER" },
];

const LOSS_REASONS = [
  "Sem orçamento", "Timing errado", "Foi para o concorrente",
  "Sem fit com o produto", "Não respondeu", "Decisor não participou",
  "Preço acima do esperado",
];

/// Toda tela do sistema é uma feature; o papel libera um conjunto delas.
const FEATURES_ADMIN = [
  "inicio", "calendar", "agenda", "leads", "pipeline", "deals", "tarefas",
  "usuarios", "importar", "sessoes", "exportar", "ver_todos",
];
const FEATURES_USER = ["inicio", "calendar", "agenda", "leads", "pipeline", "deals", "tarefas"];

const TASK_TEMPLATES = [
  { key: "primeiro_contato", name: "Primeiro contato", type: "message", priority: "HIGH" as const,
    description: "Apresentar-se e confirmar o interesse antes de agendar.",
    messageText: "Oi {nome}, aqui é {closer} da Squad. Vi que você pediu contato — posso te mandar dois horários?",
    stage: "novo", dueInDays: 0 },
  { key: "confirmar_demo", name: "Confirmar presença na demo", type: "message", priority: "HIGH" as const,
    description: "Confirmar 1 dia antes para derrubar o no-show.",
    messageText: "{nome}, passando pra confirmar nossa call de {data} às {hora}. Fica de pé?",
    stage: "demo_agendada", dueInDays: 1 },
  { key: "enviar_proposta", name: "Enviar proposta", type: "follow_up", priority: "HIGH" as const,
    description: "Enviar a proposta em até 24h depois da demo.",
    stage: "proposta", dueInDays: 1 },
  { key: "follow_proposta", name: "Follow-up da proposta", type: "follow_up", priority: "MEDIUM" as const,
    description: "Retomar quem recebeu proposta e não respondeu.",
    messageText: "{nome}, conseguiu olhar a proposta? Qualquer dúvida eu resolvo por aqui.",
    stage: "proposta", dueInDays: 3 },
  { key: "fechar_contrato", name: "Fechar contrato", type: "call_individual", priority: "HIGH" as const,
    description: "Call de fechamento com o decisor.",
    meetingEnabled: true, stage: "fechamento", dueInDays: 1 },
];

const SEGMENTS = ["Educação", "Varejo", "Serviços", "Tecnologia", "Saúde", "Indústria"];
const SOURCES = ["google", "instagram", "youtube", "outbound", "indicacao"];
const SCORES = ["A", "B", "C", "D", "E"];

function pick<T>(list: readonly T[], index: number) {
  return list[index % list.length];
}

async function main() {
  console.log("→ limpando base…");
  await prisma.sendQueue.deleteMany();
  await prisma.whatsappInstance.deleteMany();
  await prisma.sessionParticipant.deleteMany();
  await prisma.sessionOverride.deleteMany();
  await prisma.sessionInstance.deleteMany();
  await prisma.sessionTemplate.deleteMany();
  await prisma.taskAutomation.deleteMany();
  await prisma.taskTemplate.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.case.deleteMany();
  await prisma.dealStageHistory.deleteMany();
  await prisma.task.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.stage.deleteMany();
  await prisma.lossReason.deleteMany();
  await prisma.authSession.deleteMany();
  await prisma.user.deleteMany();

  console.log("→ usuários…");
  const passwordHash = await bcrypt.hash("squad1234", 10);

  const admin = await prisma.user.create({
    data: {
      name: "Pedro Goiozo",
      email: "pedro.goiozo@innerai.com",
      passwordHash,
      role: "ADMIN",
    },
  });

  const vendedores = await Promise.all(
    [
      { name: "Ana Martins", email: "ana.martins@innerai.com" },
      { name: "Rafael Lima", email: "rafael.lima@innerai.com" },
    ].map((data) => prisma.user.create({ data: { ...data, passwordHash, role: "USER" } })),
  );

  console.log("→ etapas, motivos de perda e permissões…");
  const stages = await Promise.all(
    STAGES.map((stage) => prisma.stage.create({ data: stage })),
  );

  await prisma.lossReason.createMany({
    data: LOSS_REASONS.map((name, i) => ({ name, orderIndex: i })),
  });

  await prisma.rolePermission.createMany({
    data: [
      { role: "ADMIN", features: FEATURES_ADMIN.join(",") },
      { role: "USER", features: FEATURES_USER.join(",") },
    ],
  });

  console.log("→ templates e automações de tarefa…");
  for (const tpl of TASK_TEMPLATES) {
    const stage = stages.find((s) => s.key === tpl.stage);
    if (!stage) continue;
    const template = await prisma.taskTemplate.create({
      data: {
        name: tpl.name,
        description: tpl.description,
        type: tpl.type,
        priority: tpl.priority,
        messageText: tpl.messageText ?? null,
        meetingEnabled: tpl.meetingEnabled ?? false,
      },
    });
    await prisma.taskAutomation.create({
      data: { templateId: template.id, targetStageId: stage.id, dueInDays: tpl.dueInDays },
    });
  }

  console.log("→ instâncias de WhatsApp…");
  const owners = [admin, ...vendedores];
  await Promise.all(
    owners.map((owner, i) =>
      prisma.whatsappInstance.create({
        data: {
          instanceName: `squad-${owner.email.split("@")[0]}`,
          phoneNumber: `+55119${String(70000000 + i * 1111).slice(0, 8)}`,
          status: i === 0 ? "connected" : "disconnected",
          isDefault: i === 0,
          ownerId: owner.id,
        },
      }),
    ),
  );

  console.log("→ sessões recorrentes…");
  const template = await prisma.sessionTemplate.create({
    data: {
      name: "Demo coletiva",
      weekdays: "2,4",     // terça e quinta
      time: "10:00",
      durationMin: 45,
      capacity: 20,
      ownerId: admin.id,
    },
  });

  console.log("→ leads, negócios, tarefas e reuniões…");
  const nomes = [
    "Bruna Macedo", "Robson Freitas", "Luiz Gustavo Ribeiro", "Arthur Germano",
    "Katia Schmitt", "Ederval Silva", "Vanessa Junqueira", "Armando Adel",
    "Wallace Gonçalves", "Oliver Magalhães", "Camila Bezerra", "Iandro Fernandes",
    "Piero Manzi", "Norma Martins", "Paulo Nicoli", "Guilherme Nascimento",
    "Fabrício Miranda", "Leyliany Vanderlei", "João Iury", "Ruy Wirtz",
  ];
  const empresas = [
    "Colégio Ômega", "Alpha Contábil", "Wkasa Imóveis", "AMC Construtora",
    "Tributaristas do Sul", "Emporium", "ALMA", "Mag", null,
  ];

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  startOfWeek.setHours(0, 0, 0, 0);

  for (const [i, nome] of nomes.entries()) {
    const owner = owners[i % owners.length];
    const status = i < 4 ? "INCOMPLETE" : i < 16 ? "COMPLETE" : "CONVERTED";

    const lead = await prisma.lead.create({
      data: {
        name: nome,
        email: `${nome.toLowerCase().replace(/[^a-z]+/g, ".")}@exemplo.com.br`,
        phone: `+55 11 9${String(80000000 + i * 137).slice(0, 8)}`,
        company: pick(empresas, i),
        jobTitle: pick(["Diretor", "CEO", "Sócio", "Gerente"], i + Math.floor(i / 3)),
        segment: pick(SEGMENTS, i + Math.floor(i / 3)),
        revenueRange: pick(["Até R$500 mil/ano", "R$1M–5M/ano", "R$5M+/ano"], i),
        score: pick(SCORES, i),
        status,
        collaborators: pick(["1–10", "11–50", "51–200", "200+"], i + Math.floor(i / 3)),
        source: pick(SOURCES, i + Math.floor(i / 3)),
        utmSource: pick(SOURCES, i + Math.floor(i / 3)),
        utmMedium: pick(["cpc", "social", "organic", "paidmedia"], i),
        utmCampaign: pick(["lancamento-q4", "always-on", "reativacao"], i),
        utmTerm: pick(["ia-para-vendas", "crm-whatsapp", "automacao"], i),
        utmContent: pick(["AD03", "AD07", "carrossel-b"], i),
        trackedLink: `https://crm.squad.com/r/${(1000 + i).toString(16)}`,
        linkClicks: i % 4,
        ownerId: owner.id,
      },
    });

    // Leads já qualificados viram negócio no pipeline.
    if (status !== "INCOMPLETE") {
      const stage = stages[(i + 1) % stages.length];
      const expectedAt = new Date(now);
      expectedAt.setDate(now.getDate() + ((i % 21) - 4));

      const deal = await prisma.deal.create({
        data: {
          code: `#${(1000 + i).toString(16)}`,
          leadId: lead.id,
          stageId: stage.id,
          valueCents: [1_200_000, 2_400_000, 4_536_000, 6_000_000][i % 4],
          product: pick(["Starter", "Pro", "Enterprise"], i),
          probability: [20, 40, 60, 80][i % 4],
          expectedAt,
          attendance: pick(["AGENDADO", "PARTICIPOU", "NAO_COMPARECEU"] as const, i),
          paymentMethod: i % 3 === 0 ? pick(["Pix", "Cartão", "Boleto"], i) : null,
          mentorshipStatus: pick(["PENDENTE", "PENDENTE", "AGENDADA", "CONCLUIDA"] as const, i),
          ownerId: owner.id,
        },
      });

      const dueAt = new Date(now);
      dueAt.setDate(now.getDate() + ((i % 9) - 3));
      dueAt.setHours(9 + (i % 8), 0, 0, 0);

      await prisma.task.create({
        data: {
          subject: pick(["Follow-up", "Enviar proposta", "Call individual", "Retomar contato"], i),
          type: pick(["follow_up", "call_individual", "message", "call"], i),
          priority: pick(["HIGH", "MEDIUM", "LOW"] as const, i + Math.floor(i / 3)),
          status: i % 5 === 0 ? "DONE" : "PENDING",
          completedAt: i % 5 === 0 ? now : null,
          dueAt,
          ownerId: owner.id,
          dealId: deal.id,
          leadId: lead.id,
        },
      });
    }

    // Reuniões espalhadas pela semana corrente (seg–sex, 08h–18h).
    if (i % 2 === 0) {
      const startsAt = new Date(startOfWeek);
      startsAt.setDate(startOfWeek.getDate() + (i % 5));
      startsAt.setHours(8 + ((i * 3) % 10), 0, 0, 0);
      const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);

      await prisma.meeting.create({
        data: {
          title: `Reunião · ${nome}`,
          startsAt,
          endsAt,
          type: i % 6 === 0 ? "GROUP" : "ONE_ON_ONE",
          status: startsAt < now ? (i % 7 === 0 ? "NO_SHOW" : "DONE") : "SCHEDULED",
          ownerId: owner.id,
          leadId: lead.id,
        },
      });
    }
  }

  console.log("→ materializando instâncias do template…");
  for (let d = 0; d < 14; d++) {
    const dia = new Date(startOfWeek);
    dia.setDate(startOfWeek.getDate() + d);
    const weekday = dia.getDay() === 0 ? 7 : dia.getDay();
    if (!template.weekdays.split(",").map(Number).includes(weekday)) continue;

    await prisma.sessionInstance.create({
      data: {
        date: dia,
        time: template.time,
        durationMin: template.durationMin,
        capacity: template.capacity,
        templateId: template.id,
        ownerId: template.ownerId,
        status: dia < now ? "DONE" : "SCHEDULED",
      },
    });
  }

  console.log("→ cases de sucesso…");
  await prisma.case.createMany({
    data: [
      {
        title: "VEDUC Matrículas: matrícula 24/7 sem aumentar o time",
        client: "VEDUC", segment: "Educação",
        highlight: "3x", metric: "Matrículas por consultor",
        summary: "Automatizou a captação e a triagem de interessados; o time passou a falar só com quem já estava qualificado.",
        link: "https://exemplo.com/cases/veduc",
      },
      {
        title: "Colégio Horizonte: resposta de 6h para 4min",
        client: "Colégio Horizonte", segment: "Educação",
        highlight: "-96%", metric: "Tempo de primeira resposta",
        summary: "Primeiro contato automático no WhatsApp encurtou a janela entre o interesse e a conversa real.",
      },
      {
        title: "Construtora Atlas: proposta no mesmo dia da visita",
        client: "Atlas", segment: "Construção",
        highlight: "2,4x", metric: "Propostas enviadas",
        summary: "Padronizou o orçamento pós-visita e tirou o gargalo do engenheiro que montava tudo à mão.",
      },
      {
        title: "Rede Vitta: agenda cheia sem recepção sobrecarregada",
        client: "Rede Vitta", segment: "Saúde",
        highlight: "+38%", metric: "Ocupação da agenda",
        summary: "Confirmação e remarcação automáticas derrubaram o no-show sem contratar mais gente.",
      },
      {
        title: "Loja Norte: recuperação de carrinho que paga o mês",
        client: "Loja Norte", segment: "Varejo",
        highlight: "R$ 180k", metric: "Receita recuperada/mês",
        summary: "Retomada automática de quem abandonou o checkout, com oferta calibrada por faixa de ticket.",
      },
      {
        title: "Grupo Meridiano: onboarding de cliente em 2 dias",
        client: "Meridiano", segment: "Serviços",
        highlight: "-70%", metric: "Tempo de onboarding",
        summary: "Coleta de documentos e setup viraram fluxo guiado; o cliente entra operando na primeira semana.",
      },
      {
        title: "Fábrica Sul: previsão de demanda que parou a ruptura",
        client: "Fábrica Sul", segment: "Indústria",
        highlight: "-52%", metric: "Ruptura de estoque",
        summary: "Modelo de demanda ligado ao histórico de pedidos antecipou picos que antes pegavam o PCP de surpresa.",
      },
      {
        title: "Tech Ponte: SDR que só entrega reunião qualificada",
        client: "Tech Ponte", segment: "Tecnologia",
        highlight: "4,1x", metric: "Reuniões qualificadas",
        summary: "Qualificação automática antes do agendamento tirou do time as conversas que nunca iam fechar.",
      },
    ],
  });

  console.log("→ marcando algumas perdas com motivo…");
  const motivos = await prisma.lossReason.findMany({ orderBy: { orderIndex: "asc" } });
  const perdiveis = await prisma.deal.findMany({ take: 4, orderBy: { createdAt: "asc" } });
  for (const [i, deal] of perdiveis.entries()) {
    await prisma.deal.update({
      where: { id: deal.id },
      data: {
        status: "LOST",
        lostAt: now,
        lossReasonId: motivos[i % motivos.length].id,
      },
    });
  }

  const counts = {
    usuarios: await prisma.user.count(),
    leads: await prisma.lead.count(),
    negocios: await prisma.deal.count(),
    tarefas: await prisma.task.count(),
    reunioes: await prisma.meeting.count(),
    cases: await prisma.case.count(),
    motivosPerda: await prisma.lossReason.count(),
    templatesTarefa: await prisma.taskTemplate.count(),
    automacoes: await prisma.taskAutomation.count(),
    instanciasWhats: await prisma.whatsappInstance.count(),
    sessoesRecorrentes: await prisma.sessionInstance.count(),
  };

  console.log("\n✓ seed concluído:", counts);
  console.log("\n  Admin:    pedro.goiozo@innerai.com / squad1234");
  console.log("  Vendedor: ana.martins@innerai.com   / squad1234\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
