import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../src/generated/prisma/client";
import { env, identificador } from "../src/lib/env";
import { atingiuPresenca } from "../src/lib/presenca";

// ─────────────────────────── Trava de segurança ───────────────────────────
// Este seed APAGA a base inteira. Com os três apps dentro do mesmo projeto
// Supabase, o que separa desenvolvimento de produção é o SCHEMA — então é o
// schema que a trava olha. Só passa quem termina em `_dev` (ou um arquivo
// local, se algum dia alguém voltar a rodar SQLite).
const DB = env("DATABASE_URL", "file:./dev.db")!;
const SCHEMA = identificador("DB_SCHEMA", env("DB_SCHEMA", "crm")!);
if (!DB.startsWith("file:") && !SCHEMA.endsWith("_dev")) {
  console.error(
    `\n✗ Recusando rodar: DB_SCHEMA="${SCHEMA}" não é um schema de desenvolvimento.\n` +
      `  Este seed apaga todas as tabelas. Em produção isso destrói a operação.\n` +
      `  Para semear produção de propósito, faça-o explicitamente e com backup.\n`,
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DB }, { schema: SCHEMA }),
});

// ─────────────────────── Aleatoriedade determinística ───────────────────────
// PRNG com semente fixa: o mesmo seed sempre gera a mesma base. Isso é o que
// permite escrever teste de métrica contra números conhecidos.
let _s = 20260913;
const rnd = () => {
  _s |= 0; _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
/** Sorteia por peso: [["a", 3], ["b", 1]] devolve "a" 3× mais que "b". */
const weighted = <T,>(pairs: readonly (readonly [T, number])[]) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; }
  return pairs[pairs.length - 1][0];
};

const HOJE = new Date(2026, 8, 13, 12, 0, 0);      // 13/09/2026, âncora fixa
const diasAtras = (d: number, hora = 10) => {
  const x = new Date(HOJE);
  x.setDate(HOJE.getDate() - d);
  x.setHours(hora, [0, 15, 30, 45][int(0, 3)], 0, 0);
  return x;
};

// ─────────────────────────────── Catálogos ───────────────────────────────
const STAGES = [
  { key: "novo", name: "Novo", order: 1, color: "#a8a29e", targetRole: "SDR", prob: 10 },
  { key: "contatado", name: "Contatado", order: 2, color: "#e8912d", targetRole: "SDR", prob: 25 },
  { key: "demo_agendada", name: "Demo agendada", order: 3, color: "#0ea5e9", targetRole: "CLOSER", prob: 40 },
  { key: "proposta", name: "Proposta", order: 4, color: "#8b5cf6", targetRole: "CLOSER", prob: 60 },
  { key: "fechamento", name: "Fechamento", order: 5, color: "#2dc86a", targetRole: "CLOSER", prob: 80 },
];

const LOSS_REASONS = [
  "Sem orçamento", "Timing errado", "Foi para o concorrente",
  "Sem fit com o produto", "Não respondeu", "Decisor não participou",
  "Preço acima do esperado",
];

// Exatamente os valores que o de-para do Dashboard reconhece.
const CANAIS = [
  { src: "google", peso: 22, conv: 0.34, ticket: 1.15 },
  { src: "instagram", peso: 20, conv: 0.22, ticket: 0.85 },
  { src: "youtube", peso: 14, conv: 0.28, ticket: 1.0 },
  { src: "facebook", peso: 10, conv: 0.16, ticket: 0.8 },
  { src: "indicacao", peso: 12, conv: 0.52, ticket: 1.45 },
  { src: "outbound", peso: 14, conv: 0.30, ticket: 1.35 },
  { src: "organic", peso: 8, conv: 0.26, ticket: 0.95 },
] as const;

const MEDIUMS: Record<string, string> = {
  google: "cpc", instagram: "social", youtube: "video", facebook: "social",
  indicacao: "referral", outbound: "prospect", organic: "organic",
};

const SEGMENTOS = ["Educação", "Varejo", "Serviços", "Tecnologia", "Saúde", "Indústria", "Construção", "Alimentação", "Eventos"];
const CARGOS = ["CEO", "Diretor", "Sócio", "Gerente", "Head de Vendas", "Fundador"];
const FATURAMENTOS = ["Até R$500 mil/ano", "R$500 mil–1M/ano", "R$1M–5M/ano", "R$5M+/ano"];
const COLABORADORES = ["1–10", "11–50", "51–200", "200+"];

const NOMES = ["Ana","Bruno","Carla","Diego","Elisa","Fábio","Gabriela","Henrique","Isabela","João","Karina","Lucas","Mariana","Nelson","Olívia","Paulo","Queila","Rafael","Sofia","Thiago","Úrsula","Vinícius","Wagner","Yasmin","Zeca","Amanda","Beatriz","Caio","Daniela","Eduardo","Fernanda","Gustavo","Helena","Igor","Juliana","Kleber","Larissa","Marcelo","Natália","Otávio","Patrícia","Renata","Sérgio","Tatiana","Ubiratan","Valéria","William","Ximena"];
const SOBRENOMES = ["Silva","Santos","Oliveira","Souza","Rodrigues","Ferreira","Alves","Pereira","Lima","Gomes","Costa","Ribeiro","Martins","Carvalho","Almeida","Lopes","Soares","Fernandes","Vieira","Barbosa","Rocha","Dias","Nascimento","Moreira","Nunes","Marques","Machado","Mendes","Freitas","Cardoso"];
const EMPRESAS = ["Alpha","Vértice","Horizonte","Nexus","Primus","Atlas","Órion","Solaris","Meridiano","Âncora","Vertical","Cume","Delta","Farol","Granito","Ímpeto","Junco","Lumina","Marco","Norte"];
const SUFIXOS = ["Consultoria","Tecnologia","Soluções","Group","Participações","Serviços","Comércio","Educação","Sistemas","Ltda"];

const TASK_TEMPLATES = [
  { name: "Primeiro contato", type: "message", priority: "HIGH" as const, stage: "novo", dueInDays: 0,
    description: "Apresentar-se e confirmar o interesse antes de agendar.",
    messageText: "Oi {nome}, aqui é {closer} da Squad. Vi que você pediu contato — posso te mandar dois horários?" },
  { name: "Confirmar presença na demo", type: "message", priority: "HIGH" as const, stage: "demo_agendada", dueInDays: 1,
    description: "Confirmar 1 dia antes para derrubar o no-show.",
    messageText: "{nome}, passando pra confirmar nossa call de {data} às {hora}. Fica de pé?" },
  { name: "Enviar proposta", type: "follow_up", priority: "HIGH" as const, stage: "proposta", dueInDays: 1,
    description: "Enviar a proposta em até 24h depois da demo." },
  { name: "Follow-up da proposta", type: "follow_up", priority: "MEDIUM" as const, stage: "proposta", dueInDays: 3,
    description: "Retomar quem recebeu proposta e não respondeu.",
    messageText: "{nome}, conseguiu olhar a proposta? Qualquer dúvida eu resolvo por aqui." },
  { name: "Fechar contrato", type: "call_individual", priority: "HIGH" as const, stage: "fechamento", dueInDays: 1,
    description: "Call de fechamento com o decisor.", meetingEnabled: true },
];

const FEATURES_ADMIN = ["inicio","calendar","agenda","leads","pipeline","deals","tarefas","sessoes","participantes","time","usuarios","configuracoes","importar","exportar","ver_todos"];
const FEATURES_USER = ["inicio","calendar","agenda","leads","pipeline","deals","tarefas","sessoes","participantes"];

const CASES = [
  { title: "VEDUC: matrícula 24/7 sem aumentar o time", client: "VEDUC", segment: "Educação", highlight: "3x", metric: "Matrículas por consultor", summary: "Automatizou captação e triagem; o time passou a falar só com quem já estava qualificado." },
  { title: "Colégio Horizonte: resposta de 6h para 4min", client: "Colégio Horizonte", segment: "Educação", highlight: "-96%", metric: "Tempo de primeira resposta", summary: "Primeiro contato automático encurtou a janela entre o interesse e a conversa real." },
  { title: "Construtora Atlas: proposta no mesmo dia da visita", client: "Atlas", segment: "Construção", highlight: "2,4x", metric: "Propostas enviadas", summary: "Padronizou o orçamento pós-visita e tirou o gargalo do engenheiro." },
  { title: "Rede Vitta: agenda cheia sem recepção sobrecarregada", client: "Rede Vitta", segment: "Saúde", highlight: "+38%", metric: "Ocupação da agenda", summary: "Confirmação e remarcação automáticas derrubaram o no-show." },
  { title: "Loja Norte: recuperação de carrinho que paga o mês", client: "Loja Norte", segment: "Varejo", highlight: "R$ 180k", metric: "Receita recuperada/mês", summary: "Retomada automática de quem abandonou o checkout, com oferta por faixa de ticket." },
  { title: "Grupo Meridiano: onboarding de cliente em 2 dias", client: "Meridiano", segment: "Serviços", highlight: "-70%", metric: "Tempo de onboarding", summary: "Coleta de documentos e setup viraram fluxo guiado." },
  { title: "Fábrica Sul: previsão de demanda que parou a ruptura", client: "Fábrica Sul", segment: "Indústria", highlight: "-52%", metric: "Ruptura de estoque", summary: "Modelo de demanda ligado ao histórico antecipou picos que pegavam o PCP de surpresa." },
  { title: "Tech Ponte: SDR que só entrega reunião qualificada", client: "Tech Ponte", segment: "Tecnologia", highlight: "4,1x", metric: "Reuniões qualificadas", summary: "Qualificação automática antes do agendamento tirou as conversas que nunca iam fechar." },
  { title: "Sabor Real: pedido por WhatsApp sem operador", client: "Sabor Real", segment: "Alimentação", highlight: "+61%", metric: "Pedidos fora do horário", summary: "Atendimento automático capturou a demanda da madrugada que antes se perdia." },
  { title: "Expo Vivo: credenciamento em 40 segundos", client: "Expo Vivo", segment: "Eventos", highlight: "-85%", metric: "Fila de credenciamento", summary: "Check-in automatizado eliminou a fila de entrada do evento." },
];

async function main() {
  console.log(`\n→ semente fixa ${_s} · âncora ${HOJE.toLocaleDateString("pt-BR")}\n`);

  console.log("→ limpando base…");
  await prisma.sendQueue.deleteMany();
  await prisma.whatsappInstance.deleteMany();
  await prisma.sessionParticipant.deleteMany();
  await prisma.sessionOverride.deleteMany();
  await prisma.sessionInstance.deleteMany();
  await prisma.sessionTemplate.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.note.deleteMany();
  await prisma.dealStageHistory.deleteMany();
  await prisma.task.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.taskAutomation.deleteMany();
  await prisma.taskTemplate.deleteMany();
  await prisma.case.deleteMany();
  await prisma.stage.deleteMany();
  await prisma.lossReason.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.authSession.deleteMany();
  await prisma.user.deleteMany();

  // ── Usuários ──
  console.log("→ usuários…");
  const hash = await bcrypt.hash("squad1234", 10);
  const admin = await prisma.user.create({
    data: { name: "Pedro Goiozo", email: "pedro.goiozo@innerai.com", passwordHash: hash, role: "ADMIN" },
  });

  const CLOSERS = [
    "Ana Martins", "Rafael Lima", "Camila Duarte", "Bruno Sales",
    "Letícia Prado", "Marcos Vieira", "Júlia Neves", "Diego Cardoso",
    "Renata Castro", "Thiago Moraes",
  ];
  const closers = [];
  for (const nome of CLOSERS) {
    const email = `${nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, ".")}@innerai.com`;
    closers.push(await prisma.user.create({ data: { name: nome, email, passwordHash: hash, role: "USER" } }));
  }
  const todos = [admin, ...closers];

  // ── Catálogos ──
  console.log("→ etapas, motivos, permissões, cases…");
  const stages = [];
  for (const s of STAGES) {
    const { prob, ...data } = s;
    stages.push({ ...(await prisma.stage.create({ data })), prob });
  }
  await prisma.lossReason.createMany({ data: LOSS_REASONS.map((name, i) => ({ name, orderIndex: i })) });
  const motivos = await prisma.lossReason.findMany({ orderBy: { orderIndex: "asc" } });
  await prisma.rolePermission.createMany({
    data: [
      { role: "ADMIN", features: FEATURES_ADMIN.join(",") },
      { role: "USER", features: FEATURES_USER.join(",") },
    ],
  });
  await prisma.case.createMany({ data: CASES });

  console.log("→ templates e automações de tarefa…");
  for (const tpl of TASK_TEMPLATES) {
    const stage = stages.find((s) => s.key === tpl.stage)!;
    const template = await prisma.taskTemplate.create({
      data: {
        name: tpl.name, description: tpl.description, type: tpl.type, priority: tpl.priority,
        messageText: tpl.messageText ?? null, meetingEnabled: tpl.meetingEnabled ?? false,
      },
    });
    await prisma.taskAutomation.create({
      data: { templateId: template.id, targetStageId: stage.id, dueInDays: tpl.dueInDays },
    });
  }

  console.log("→ instâncias de WhatsApp e sessões recorrentes…");
  for (const [i, owner] of todos.slice(0, 6).entries()) {
    await prisma.whatsappInstance.create({
      data: {
        instanceName: `squad-${owner.email.split("@")[0]}`,
        phoneNumber: `+5511${String(970000000 + i * 11111)}`,
        status: i < 4 ? "connected" : "disconnected",
        isDefault: i === 0,
        ownerId: owner.id,
      },
    });
  }
  const template = await prisma.sessionTemplate.create({
    data: { name: "Demo coletiva", weekdays: "2,4", time: "10:00", durationMin: 45, capacity: 20, ownerId: admin.id },
  });
  for (let d = -14; d <= 14; d++) {
    const dia = new Date(HOJE); dia.setDate(HOJE.getDate() + d); dia.setHours(0, 0, 0, 0);
    const wd = dia.getDay() === 0 ? 7 : dia.getDay();
    if (!template.weekdays.split(",").map(Number).includes(wd)) continue;
    await prisma.sessionInstance.create({
      data: {
        date: dia, time: template.time, durationMin: 45, capacity: 20,
        templateId: template.id, ownerId: template.ownerId,
        status: dia < HOJE ? "DONE" : "SCHEDULED",
      },
    });
  }

  const instancias = await prisma.sessionInstance.findMany({ orderBy: { date: "asc" } });

  // A régua de presença sai do banco, igual ao runtime. Upsert porque o seed
  // pode rodar num schema que ainda não tem a linha única.
  const regra = await prisma.config.upsert({ where: { id: "unica" }, update: {}, create: {} });

  // ── Leads, reuniões e negócios ao longo de 6 meses ──
  console.log("→ 400 leads ao longo de 6 meses…");
  const DIAS = 182;
  let nDeals = 0, nWon = 0, nLost = 0, nMeetings = 0, nTasks = 0, nHist = 0, nNotes = 0;
  let receitaCents = 0;

  for (let i = 0; i < 400; i++) {
    const canal = weighted(CANAIS.map((c) => [c, c.peso] as const));
    // Leads mais recentes têm menos tempo de maturação — é o que dá forma ao funil.
    const idade = int(0, DIAS);
    const criadoEm = diasAtras(idade, int(8, 20));
    const owner = pick(todos);
    const nome = `${pick(NOMES)} ${pick(SOBRENOMES)}`;
    const empresa = rnd() < 0.82 ? `${pick(EMPRESAS)} ${pick(SUFIXOS)}` : null;
    const score = weighted([["A", 8], ["B", 18], ["C", 30], ["D", 26], ["E", 18]] as const);

    // Maturação: só lead com alguma idade chega às etapas finais.
    const maduro = idade > 21;
    const virouNegocio = rnd() < (maduro ? 0.62 : 0.28);

    const lead = await prisma.lead.create({
      data: {
        name: nome,
        email: `${nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, ".")}${i}@exemplo.com.br`,
        phone: `+5511${String(980000000 + i * 137).slice(0, 9)}`,
        company: empresa,
        jobTitle: empresa ? pick(CARGOS) : null,
        segment: pick(SEGMENTOS),
        revenueRange: pick(FATURAMENTOS),
        collaborators: pick(COLABORADORES),
        score,
        status: virouNegocio ? "CONVERTED" : empresa ? "COMPLETE" : "INCOMPLETE",
        source: canal.src,
        utmSource: canal.src,
        utmMedium: MEDIUMS[canal.src],
        utmCampaign: pick(["always-on", "lancamento-q3", "reativacao", "black-setembro"]),
        utmTerm: pick(["ia-para-vendas", "crm-whatsapp", "automacao-comercial"]),
        utmContent: pick(["AD03", "AD07", "carrossel-b", "video-30s"]),
        trackedLink: `https://crm.squad.com/r/${(4096 + i).toString(16)}`,
        linkClicks: rnd() < 0.4 ? int(1, 6) : 0,
        ownerId: owner.id,
        createdAt: criadoEm,
      },
    });

    // ── Reunião: nasce alguns dias depois do lead ──
    if (rnd() < 0.62) {
      const emDias = idade - int(2, 10);
      const inicio = diasAtras(Math.max(emDias, -20), int(8, 18));
      const passado = inicio < HOJE;
      await prisma.meeting.create({
        data: {
          title: `Demo · ${nome}`,
          startsAt: inicio,
          endsAt: new Date(inicio.getTime() + 45 * 60_000),
          type: rnd() < 0.25 ? "GROUP" : "ONE_ON_ONE",
          status: passado
            ? weighted([["DONE", 62], ["NO_SHOW", 28], ["CANCELED", 10]] as const)
            : "SCHEDULED",
          ownerId: owner.id,
          leadId: lead.id,
          createdAt: criadoEm,
        },
      });
      nMeetings++;
    }

    // ── Inscrição numa sessão coletiva, com presença derivada do tempo ──
    if (instancias.length && rnd() < 0.35) {
      const inst = pick(instancias);
      const passou = inst.date < HOJE;
      const ficou = passou ? (rnd() < 0.68 ? int(900, 2700) : int(0, 240)) : 0;
      const entrou = passou && ficou > 0
        ? new Date(inst.date.getTime() + int(0, 5) * 60_000)
        : null;
      try {
        await prisma.sessionParticipant.create({
          data: {
            sessionInstanceId: inst.id,
            leadId: lead.id,
            joinedAt: entrou,
            leftAt: entrou ? new Date(entrou.getTime() + ficou * 1000) : null,
            joinCount: entrou ? int(1, 2) : 0,
            totalSeconds: ficou,
            // Presença é consequência do tempo, não um checkbox — e a régua é
            // a mesma que o runtime usa. O `>= 300` literal que estava aqui
            // era a terceira cópia divergente da mesma regra.
            attended: atingiuPresenca(ficou, inst.durationMin * 60, regra),
          },
        });
      } catch {
        // @@unique(sessionInstanceId, leadId) — lead já inscrito nesta sessão.
      }
    }

    if (!virouNegocio) continue;

    // ── Negócio ──
    // Ticket varia por canal: indicação e outbound fecham mais caro.
    const base = int(300_000, 6_000_000);
    const valueCents = Math.round((base * canal.ticket) / 1000) * 1000;
    const desfecho = weighted([["WON", canal.conv * 100], ["LOST", 34], ["OPEN", maduro ? 42 : 78]] as const);

    const etapa = desfecho === "WON"
      ? stages[4]
      : desfecho === "LOST"
        ? pick(stages.slice(1))
        : stages[weighted([[0, 22], [1, 26], [2, 24], [3, 18], [4, 10]] as const)];

    // Fechamento acontece dias depois da criação, dentro da janela de 6 meses.
    const ciclo = int(5, 45);
    const fechouEm = idade - ciclo > 0 ? diasAtras(idade - ciclo, int(9, 19)) : null;

    const deal = await prisma.deal.create({
      data: {
        code: `#${(0x1000 + i).toString(16)}`,
        leadId: lead.id,
        stageId: etapa.id,
        status: desfecho === "WON" && fechouEm ? "WON" : desfecho === "LOST" && fechouEm ? "LOST" : "OPEN",
        valueCents,
        product: weighted([["Starter", 30], ["Pro", 50], ["Enterprise", 20]] as const),
        probability: desfecho === "WON" && fechouEm ? 100 : etapa.prob,
        expectedAt: diasAtras(idade - ciclo - int(0, 20), 12),
        attendance: weighted([["PARTICIPOU", 58], ["AGENDADO", 24], ["NAO_COMPARECEU", 18]] as const),
        paymentMethod: desfecho === "WON" ? pick(["Pix", "Cartão", "Boleto", "Transferência"]) : null,
        mentorshipStatus: desfecho === "WON" ? "CONCLUIDA" : weighted([["PENDENTE", 60], ["AGENDADA", 25], ["CONCLUIDA", 15]] as const),
        wonAt: desfecho === "WON" && fechouEm ? fechouEm : null,
        lostAt: desfecho === "LOST" && fechouEm ? fechouEm : null,
        lossReasonId: desfecho === "LOST" && fechouEm ? pick(motivos).id : null,
        ownerId: owner.id,
        createdAt: criadoEm,
      },
    });
    nDeals++;
    if (deal.status === "WON") { nWon++; receitaCents += valueCents; }
    if (deal.status === "LOST") nLost++;

    // ── Histórico de etapas: o caminho que o negócio percorreu ──
    let anterior: string | null = null;
    for (const s of stages.slice(0, stages.indexOf(etapa) + 1)) {
      await prisma.dealStageHistory.create({
        data: {
          dealId: deal.id, fromStage: anterior, toStage: s.id, movedBy: owner.id,
          createdAt: diasAtras(Math.max(idade - stages.indexOf(s) * int(2, 6), 0), 11),
        },
      });
      anterior = s.id;
      nHist++;
    }

    // ── Tarefa pendente nos negócios ainda abertos ──
    if (deal.status === "OPEN" && rnd() < 0.7) {
      const vence = int(-8, 12);
      await prisma.task.create({
        data: {
          subject: pick(["Follow-up", "Enviar proposta", "Retomar contato", "Call individual", "Confirmar presença"]),
          type: pick(["follow_up", "call_individual", "message", "call"]),
          priority: weighted([["HIGH", 30], ["MEDIUM", 45], ["LOW", 25]] as const),
          status: rnd() < 0.18 ? "DONE" : "PENDING",
          dueAt: vence >= 0 ? diasAtras(vence, int(9, 18)) : (() => { const d = new Date(HOJE); d.setDate(HOJE.getDate() - vence); return d; })(),
          ownerId: owner.id, dealId: deal.id, leadId: lead.id,
          createdAt: criadoEm,
        },
      });
      nTasks++;
    }

    // ── Anotação e atividade, para a linha do tempo não ficar vazia ──
    if (rnd() < 0.35) {
      await prisma.note.create({
        data: {
          content: pick([
            "Pediu para retomar depois do fechamento do trimestre.",
            "Decisor é o sócio; precisa entrar na próxima call.",
            "Já usa uma ferramenta concorrente, contrato vence em 3 meses.",
            "Interesse alto, travou no orçamento. Tentar plano menor.",
            "Pediu case do mesmo setor antes de avançar.",
          ]),
          authorId: owner.id, leadId: lead.id, dealId: deal.id, createdAt: criadoEm,
        },
      });
      nNotes++;
    }

    await prisma.activity.create({
      data: {
        kind: deal.status === "WON" ? "DEAL_WON" : deal.status === "LOST" ? "DEAL_LOST" : "DEAL_CREATED",
        title: deal.status === "WON" ? "Negócio ganho" : deal.status === "LOST" ? "Negócio perdido" : `Negócio criado em ${etapa.name}`,
        authorId: owner.id, leadId: lead.id, dealId: deal.id,
        createdAt: fechouEm ?? criadoEm,
      },
    });
  }

  const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  console.log(`
✓ seed concluído (determinístico — rodar de novo gera exatamente isto)

  usuários ........ ${todos.length} (1 admin, ${closers.length} closers)
  leads ........... 400  ·  6 meses  ·  7 canais
  reuniões ........ ${nMeetings}
  negócios ........ ${nDeals}   ganhos ${nWon} · perdidos ${nLost} · abertos ${nDeals - nWon - nLost}
  receita ganha ... ${brl(receitaCents)}
  histórico ....... ${nHist} movimentos de etapa
  tarefas ......... ${nTasks}   anotações ${nNotes}
  sessões ......... ${await prisma.sessionInstance.count()}  ·  inscrições ${await prisma.sessionParticipant.count()}
  cases ........... ${CASES.length}

  Admin:    pedro.goiozo@innerai.com / squad1234
  Closer:   ana.martins@innerai.com  / squad1234
`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
