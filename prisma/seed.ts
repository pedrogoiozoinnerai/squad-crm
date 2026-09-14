import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Seed de CATÁLOGO — o que a operação precisa para existir, e nada mais.
 *
 * Não cria lead, negócio, reunião nem usuário: esses vêm do HubSpot (migração)
 * ou do funil. É **idempotente** por chave natural, então rodar de novo não
 * duplica nem sobrescreve o que o time já ajustou pela tela de Configurações —
 * por isso é seguro em produção, ao contrário do `db:seed:demo`.
 *
 * Nenhum usuário é criado de propósito: o PRIMEIRO cadastro na tela de login
 * vira ADMIN. Assim não existe senha conhecida no repositório.
 */
const schema = process.env.DB_SCHEMA ?? "crm";
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 }, { schema }),
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

const FEATURES_ADMIN = ["inicio","calendar","agenda","leads","pipeline","deals","tarefas","sessoes","participantes","time","usuarios","configuracoes","importar","exportar","ver_todos"];
const FEATURES_USER = ["inicio","calendar","agenda","leads","pipeline","deals","tarefas","sessoes","participantes"];

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
  console.log(`\n→ catálogo no schema "${schema}" (idempotente)\n`);

  const stages = [];
  for (const s of STAGES) {
    stages.push(await prisma.stage.upsert({ where: { key: s.key }, update: {}, create: s }));
  }
  console.log(`  etapas ............ ${stages.length}`);

  for (const [i, name] of LOSS_REASONS.entries()) {
    await prisma.lossReason.upsert({ where: { name }, update: {}, create: { name, orderIndex: i } });
  }
  console.log(`  motivos de perda .. ${LOSS_REASONS.length}`);

  for (const [role, features] of [["ADMIN", FEATURES_ADMIN], ["USER", FEATURES_USER]] as const) {
    await prisma.rolePermission.upsert({
      where: { role },
      // Permissão é o único item que reconciliamos: feature nova precisa chegar
      // ao papel sem alguém ter de editar à mão depois do deploy.
      update: { features: features.join(",") },
      create: { role, features: features.join(",") },
    });
  }
  console.log(`  permissões ........ 2 papéis`);

  let novos = 0;
  for (const tpl of TASK_TEMPLATES) {
    const stage = stages.find((s) => s.key === tpl.stage)!;
    const existe = await prisma.taskTemplate.findFirst({ where: { name: tpl.name } });
    if (existe) continue;
    const template = await prisma.taskTemplate.create({
      data: {
        name: tpl.name, description: tpl.description, type: tpl.type, priority: tpl.priority,
        messageText: tpl.messageText ?? null, meetingEnabled: tpl.meetingEnabled ?? false,
      },
    });
    await prisma.taskAutomation.create({
      data: { templateId: template.id, targetStageId: stage.id, dueInDays: tpl.dueInDays },
    });
    novos++;
  }
  console.log(`  templates ......... ${await prisma.taskTemplate.count()} (${novos} novos)`);

  for (const c of CASES) {
    const existe = await prisma.case.findFirst({ where: { title: c.title } });
    if (!existe) await prisma.case.create({ data: c });
  }
  console.log(`  cases ............. ${await prisma.case.count()}`);

  const usuarios = await prisma.user.count();
  console.log(`\n  usuários .......... ${usuarios}`);
  if (usuarios === 0) {
    console.log(`
  Nenhum usuário — e é de propósito. Crie o seu na tela de login
  ("Criar conta"): o primeiro cadastro vira ADMIN. Assim não existe
  senha conhecida no repositório.
`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
