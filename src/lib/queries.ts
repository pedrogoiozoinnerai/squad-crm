import "server-only";

import { addDays } from "date-fns";

import { diaCivil, inicioDoDia, inicioDoMes, instanteLocal, weekStart } from "@/lib/dates";
import { statusDeNegocio } from "@/lib/forms";
import { fimDoMes } from "@/lib/horizonte";

import { ownerScope, type SessionUser } from "@/lib/auth";
import { ehQualificado, taxaDaSessao } from "@/lib/presenca";
import { DB_SCHEMA, prisma } from "@/lib/prisma";

/**
 * As três somas do topo do início, calculadas no banco.
 *
 * `$queryRawUnsafe` porque o schema entra por interpolação — identificador não
 * aceita bind param. Ele vem de `DB_SCHEMA`, já validado por `identificador()`
 * na subida do cliente, e todo valor de fato variável vai como parâmetro.
 */
async function somasDoPipeline(ownerId: string | undefined, inicioMes: Date, fimMes: Date) {
  const linhas = await prisma.$queryRawUnsafe<
    { bruto: bigint; ponderado: bigint; previsto: bigint }[]
  >(
    `SELECT
       COALESCE(SUM("valueCents"), 0)::bigint AS bruto,
       COALESCE(ROUND(SUM("valueCents"::numeric * "probability") / 100), 0)::bigint AS ponderado,
       COALESCE(ROUND(SUM(CASE WHEN "expectedAt" >= $1 AND "expectedAt" < $2
                               THEN "valueCents"::numeric * "probability" ELSE 0 END) / 100), 0)::bigint AS previsto
     FROM "${DB_SCHEMA}"."Deal"
     WHERE status = 'OPEN'
       AND ($3::text IS NULL OR "ownerId" = $3)`,
    inicioMes,
    fimMes,
    ownerId ?? null,
  );

  const linha = linhas[0];
  return {
    pipelineBruto: Number(linha?.bruto ?? 0),
    pipelinePonderado: Number(linha?.ponderado ?? 0),
    previstoMes: Number(linha?.previsto ?? 0),
  };
}

/** Reuniões da semana, já no escopo do usuário. */
export async function getWeekMeetings(user: SessionUser, start: Date) {
  const reunioes = await prisma.meeting.findMany({
    where: {
      ...ownerScope(user),
      startsAt: { gte: start, lt: addDays(start, 7) },
      status: { not: "CANCELED" },
    },
    include: {
      lead: { select: { id: true, name: true, company: true, score: true } },
      owner: { select: { id: true, name: true } },
      // Só a coluna que decide o número — não o lead inteiro de cada inscrito.
      // Numa semana são ~78 sessões de até 20 pessoas; puxar o lead junto seria
      // 1.560 registros completos para desenhar dois inteiros por cartão.
      attendees: { select: { attended: true } },
      _count: { select: { gravacoes: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  // Agendados e realizados por cartão: é o que o calendário do CRM de
  // referência mostra, e é a pergunta que o gestor faz olhando a grade —
  // "quantos marcaram com esse closer, e quantos apareceram".
  return reunioes.map(({ attendees, _count, ...m }) => ({
    ...m,
    inscritos: attendees.length,
    presentes: attendees.filter((a) => a.attended).length,
    temGravacao: _count.gravacoes > 0,
  }));
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

/** As colunas da tela. `LOST` não tem coluna, mas conta no total. */
const COLUNAS_LEAD = ["INCOMPLETE", "COMPLETE", "CONVERTED"] as const;
const STATUS_LEAD = [...COLUNAS_LEAD, "LOST"] as const;

export async function getLeads(user: SessionUser) {
  const escopo = ownerScope(user);

  const [totais, fatias] = await Promise.all([
    prisma.lead.groupBy({ by: ["status"], where: escopo, _count: true }),
    Promise.all(
      COLUNAS_LEAD.map((status) =>
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

/**
 * Filtros do board, todos vindos da URL — recarregar a página não perde o
 * recorte, e o vendedor pode mandar o link de uma busca para o gestor.
 */
export type FiltroPipeline = {
  q?: string;
  closer?: string;
  prazo?: string;
  ordem?: string;
};

/**
 * Recorte por prazo de tarefa. O último é o mais útil no dia a dia: negócio
 * aberto sem nenhum próximo passo marcado é exatamente o que some do radar —
 * não aparece em lista de atrasados nem em agenda, e envelhece calado.
 */
function recorteDePrazo(prazo: string | undefined, agora: Date) {
  // Meia-noite EM SÃO PAULO, não no relógio de quem executa. Com
  // `setHours(0,0,0,0)` a Vercel (UTC) produzia 21:00 de ontem, e o teto
  // `addDays(hoje, 1)` caía às 21:00 de hoje: a tarefa que vence às 23:00
  // sumia do filtro "hoje" e também do "semana" no último dia da janela.
  const hoje = inicioDoDia(agora);
  const pendente = { status: "PENDING" as const };

  switch (prazo) {
    case "atrasados":
      return { tasks: { some: { ...pendente, dueAt: { lt: agora } } } };
    // "Até hoje" inclui o que venceu ontem de propósito: a pergunta que o
    // vendedor faz de manhã é "o que eu tenho que fazer", não "o que venceu
    // exatamente hoje".
    case "hoje":
      return { tasks: { some: { ...pendente, dueAt: { lt: addDays(hoje, 1) } } } };
    case "semana":
      return { tasks: { some: { ...pendente, dueAt: { lt: addDays(hoje, 7) } } } };
    case "sem-tarefa":
      return { tasks: { none: pendente } };
    default:
      return {};
  }
}

function ordenacaoDoBoard(ordem: string | undefined) {
  switch (ordem) {
    case "valor":
      return { valueCents: "desc" as const };
    // `nulls: last` importa: no Postgres o NULL vem primeiro no ASC, então
    // sem isso a ordenação por previsão começaria justamente pelos negócios
    // que não têm previsão nenhuma.
    case "prazo":
      return { expectedAt: { sort: "asc" as const, nulls: "last" as const } };
    case "parado":
      return { updatedAt: "asc" as const };
    default:
      return { updatedAt: "desc" as const };
  }
}

export async function getPipeline(
  user: SessionUser,
  filtros: FiltroPipeline = {},
  agora = new Date(),
) {
  const q = filtros.q?.trim();
  // Só admin escolhe closer. Para vendedor o parâmetro é ignorado, e o escopo
  // do próprio usuário continua sendo o único filtro de dono que vale.
  const closer = user.role === "ADMIN" ? filtros.closer?.trim() : undefined;

  const escopo = {
    ...ownerScope(user),
    ...(closer ? { ownerId: closer } : {}),
    status: "OPEN" as const,
    ...recorteDePrazo(filtros.prazo, agora),
    ...(q
      ? {
          lead: {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q } },
              { company: { contains: q, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const stages = await prisma.stage.findMany({ orderBy: { order: "asc" } });

  // Contagem, soma e ponderado saem de um groupBy sobre a etapa inteira.
  // Somar o que veio na fatia daria um pipeline menor que o real.
  //
  // O groupBy inclui `probability` porque o Prisma não multiplica duas colunas
  // numa agregação. Agrupando também por ela, cada linha tem uma probabilidade
  // só e o ponderado vira uma multiplicação exata — são poucas dezenas de
  // linhas (etapas × probabilidades distintas), não os 8 mil negócios.
  const [totais, fatias] = await Promise.all([
    prisma.deal.groupBy({
      by: ["stageId", "probability"],
      where: escopo,
      _count: true,
      _sum: { valueCents: true },
    }),
    Promise.all(
      stages.map((stage) =>
        prisma.deal.findMany({
          where: { ...escopo, stageId: stage.id },
          include: {
            lead: { select: { id: true, name: true, company: true, phone: true, score: true } },
            owner: { select: { name: true } },
          },
          orderBy: ordenacaoDoBoard(filtros.ordem),
          take: POR_COLUNA,
        }),
      ),
    ),
  ]);

  const porEtapa = new Map<
    string,
    { total: number; valueCents: number; ponderadoBruto: number }
  >();
  for (const linha of totais) {
    const atual = porEtapa.get(linha.stageId) ?? {
      total: 0,
      valueCents: 0,
      ponderadoBruto: 0,
    };
    const soma = linha._sum.valueCents ?? 0;
    atual.total += linha._count;
    atual.valueCents += soma;
    // Acumula sem dividir: arredondar a cada grupo somaria o erro de
    // arredondamento dezenas de vezes no total da tela.
    atual.ponderadoBruto += soma * linha.probability;
    porEtapa.set(linha.stageId, atual);
  }

  const cartoes = fatias.flat();

  // Os sinais de urgência do cartão. Duas consultas a mais, ambas limitadas
  // aos ids que já estão na tela — e sem elas o board não diz ao vendedor
  // onde ele está atrasado, que é a única pergunta que ele faz olhando pro
  // quadro.
  const dealIds = cartoes.map((deal) => deal.id);
  const leadIds = [...new Set(cartoes.map((deal) => deal.leadId))];

  const [tarefas, reunioes] = await Promise.all([
    dealIds.length
      ? prisma.task.findMany({
          where: { dealId: { in: dealIds }, status: "PENDING" },
          select: { dealId: true, dueAt: true },
        })
      : [],
    leadIds.length
      ? prisma.meeting.findMany({
          where: {
            leadId: { in: leadIds },
            status: { not: "CANCELED" },
            // Reunião de três meses atrás não é sinal de nada. O recorte
            // também impede que um lead com histórico longo traga dezenas
            // de linhas inúteis.
            startsAt: { gte: addDays(agora, -30) },
          },
          select: { leadId: true, startsAt: true, status: true },
          orderBy: { startsAt: "asc" },
        })
      : [],
  ]);

  const porDeal = new Map<
    string,
    { pendentes: number; atrasadas: number; proxima: Date | null }
  >();
  for (const tarefa of tarefas) {
    if (!tarefa.dealId) continue;
    const atual = porDeal.get(tarefa.dealId) ?? {
      pendentes: 0,
      atrasadas: 0,
      proxima: null,
    };
    atual.pendentes += 1;
    if (tarefa.dueAt) {
      if (tarefa.dueAt < agora) atual.atrasadas += 1;
      if (!atual.proxima || tarefa.dueAt < atual.proxima) atual.proxima = tarefa.dueAt;
    }
    porDeal.set(tarefa.dealId, atual);
  }

  // Vem ordenado por data: guarda a próxima reunião futura; enquanto só
  // houver passado, mantém a mais recente. A troca para enquanto a guardada
  // já for futura, porque daí as seguintes também são.
  const porLead = new Map<string, { startsAt: Date; status: string }>();
  for (const reuniao of reunioes) {
    if (!reuniao.leadId) continue;
    const atual = porLead.get(reuniao.leadId);
    if (!atual || atual.startsAt < agora) porLead.set(reuniao.leadId, reuniao);
  }

  const etapas = stages.map((stage) => {
    const soma = porEtapa.get(stage.id);
    return {
      ...stage,
      total: soma?.total ?? 0,
      valueCents: soma?.valueCents ?? 0,
      weightedCents: Math.round((soma?.ponderadoBruto ?? 0) / 100),
    };
  });

  return {
    stages: etapas,
    deals: cartoes.map((deal) => {
      const tarefa = porDeal.get(deal.id);
      const reuniao = porLead.get(deal.leadId) ?? null;
      return {
        ...deal,
        tarefasPendentes: tarefa?.pendentes ?? 0,
        tarefasAtrasadas: tarefa?.atrasadas ?? 0,
        proximaTarefa: tarefa?.proxima ?? null,
        reuniao,
      };
    }),
    // Totais do topo somados sobre as etapas, não sobre os cartões
    // carregados: a fatia é de 60 por coluna, e somar ela anunciava um
    // pipeline menor do que a própria soma das colunas logo abaixo.
    total: etapas.reduce((soma, etapa) => soma + etapa.total, 0),
    valueCents: etapas.reduce((soma, etapa) => soma + etapa.valueCents, 0),
    weightedCents: etapas.reduce((soma, etapa) => soma + etapa.weightedCents, 0),
  };
}

/**
 * Teto da fila de tarefas.
 *
 * A fila é ordenada por pendentes primeiro e prazo mais próximo, então as 200
 * do topo são exatamente as que importam hoje. Sem teto, a tela crescia junto
 * com o histórico: 398 tarefas já eram 267 KB, e a migração do HubSpot só
 * acrescenta.
 */
const FILA_TAREFAS = 200;

export async function getTasks(user: SessionUser) {
  const escopo = ownerScope(user);
  const agora = new Date();

  const [tasks, pendentes, atrasadas, concluidas] = await Promise.all([
    prisma.task.findMany({
      where: escopo,
    include: {
      lead: { select: { name: true, phone: true, company: true } },
      deal: { select: { code: true, stage: { select: { name: true, color: true } } } },
      owner: { select: { name: true } },
      // O modelo carrega a mensagem pronta; sem ele o botão de WhatsApp abre
      // a conversa em branco e cada vendedor reescreve a frase do seu jeito.
      template: { select: { messageText: true } },
    },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      take: FILA_TAREFAS,
    }),
    // Contados no banco, não no que coube na página: "Pendentes: 200" numa
    // fila de 400 mandaria o vendedor para casa achando o trabalho menor.
    prisma.task.count({ where: { ...escopo, status: "PENDING" } }),
    prisma.task.count({ where: { ...escopo, status: "PENDING", dueAt: { lt: agora } } }),
    prisma.task.count({ where: { ...escopo, status: "DONE" } }),
  ]);

  return { tasks, totais: { pendentes, atrasadas, concluidas } };
}

export async function getUsers() {
  const [users, convites] = await Promise.all([
    prisma.user.findMany({
      include: { _count: { select: { leads: true, deals: true, tasks: true } } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    prisma.invite.findMany({ where: { usedAt: null }, select: { email: true } }),
  ]);

  const liberados = new Set(convites.map((c) => c.email));
  return users.map((user) => ({
    ...user,
    // Conta sem senha veio da migração e ainda não foi assumida. Só quem está
    // liberado consegue criar a senha e entrar nela.
    aAssumir: user.claimedAt === null,
    liberado: liberados.has(user.email),
  }));
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
            // Traz o convite junto: é o link que o vendedor manda ao lead, e
            // ele lembra disso justamente ao abrir o negócio.
            include: { attendees: { select: { inviteToken: true }, take: 1 } },
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
export type FiltroDeals = {
  q?: string;
  status?: string;
  closer?: string;
  prazo?: string;
};

function filtroDeals(user: SessionUser, filters: FiltroDeals, agora = new Date()) {
  const q = filters.q?.trim();
  // Mesma regra do board: escolher closer é coisa de admin. Vale repetir aqui
  // porque esta função também alimenta a exportação, que é uma rota própria.
  const closer = user.role === "ADMIN" ? filters.closer?.trim() : undefined;

  return {
    ...ownerScope(user),
    ...(closer ? { ownerId: closer } : {}),
    ...(filters.status && filters.status !== "all"
      ? { status: statusDeNegocio(filters.status) }
      : {}),
    ...recorteDePrazo(filters.prazo, agora),
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

export async function getAllDeals(user: SessionUser, filters: FiltroDeals) {
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
export async function getDealsParaExportar(user: SessionUser, filters: FiltroDeals) {
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

/// Quantos nomes a agenda mostra por sessão antes de resumir em "+N".
///
/// Quatro: o suficiente para o closer reconhecer a sala sem transformar o
/// cartão do dia numa lista de vinte linhas que empurra a próxima reunião para
/// fora da tela.
const LISTADOS_NA_AGENDA = 4;

/** Agenda pessoal do dia: reuniões + tarefas com prazo. */
export async function getAgenda(user: SessionUser, day: Date) {
  // O dia daqui, não o do servidor. `setHours(0,0,0,0)` zerava no relógio do
  // runtime — na Vercel isso é UTC, e a "agenda de hoje" começava às 21:00 de
  // ontem: as reuniões da noite apareciam no dia errado.
  const { ano, mes, dia } = diaCivil(day);
  const start = instanteLocal(new Date(Date.UTC(ano, mes - 1, dia)), "00:00");
  const end = instanteLocal(new Date(Date.UTC(ano, mes - 1, dia + 1)), "00:00");

  const [meetings, tasks] = await Promise.all([
    prisma.meeting.findMany({
      where: { ...ownerScope(user), startsAt: { gte: start, lt: end }, status: { not: "CANCELED" } },
      include: {
        lead: { select: { name: true, company: true } },
        // O convite do lead vem junto: é o link que o vendedor manda pelo
        // WhatsApp minutos antes da call, e buscá-lo num segundo clique só
        // acrescentaria espera na hora em que ele tem menos.
        //
        // E vêm os PRIMEIROS NOMES, não só um convite. Antes era `take: 1`, e
        // por isso a agenda não sabia dizer quantas pessoas vinham: o closer
        // abria o dia e via "Grupo" — sem saber se a sessão das 10h tinha
        // dezoito inscritos ou nenhum. As duas coisas exigem reação, e
        // opostas.
        attendees: {
          where: { status: { in: ["INSCRITO", "CONFIRMADO"] } },
          select: { inviteToken: true, lead: { select: { name: true, company: true } } },
          orderBy: { createdAt: "asc" },
          take: LISTADOS_NA_AGENDA,
        },
        _count: {
          select: { attendees: { where: { status: { in: ["INSCRITO", "CONFIRMADO"] } } } },
        },
        // Quem de fato esteve na sala, para a agenda contar a história do dia
        // em vez de só o que foi agendado.
        presences: { select: { identity: true, seconds: true } },
      },
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
  // `new Date(ano, getMonth(), 1)` lê o relógio do processo: na Vercel, nas
  // três últimas horas de todo mês, já é o mês seguinte — e o painel zerava
  // "ganho no mês" para quem ainda estava no dia 31. `lib/horizonte` já
  // documentava exatamente isso; aqui a regra não estava sendo seguida.
  const inicioMes = inicioDoMes(agora);
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

  // Ponderado é valor × probabilidade linha a linha, e o `_sum` do Prisma não
  // multiplica duas colunas. A versão anterior contornava trazendo TODAS as
  // linhas abertas para somar em JavaScript: com a base do HubSpot dentro são
  // 8.593 negócios e 445 KB atravessando a rede a cada carregamento do início,
  // para produzir três números. O Postgres soma e devolve os três.
  const { pipelineBruto, pipelinePonderado, previstoMes } = await somasDoPipeline(
    scope.ownerId,
    inicioMes,
    // `addDays(inicioMes, 31)` não é o fim do mês: em fevereiro a janela ia
    // até 04/03, e nos meses de 30 dias invadia o dia 1º do seguinte. O
    // `fimDoMes` acerta bissexto de graça.
    fimDoMes(agora),
  );

  // Nomes do RANKING, não da lista de atribuição: aqui entram também contas
  // inativas, como o "Não atribuído" que recebeu 41% dos negócios importados.
  // `getOwners()` filtra por ativo — correto para um seletor, errado aqui, onde
  // o dono de 3.914 negócios apareceria como um travessão.
  const nomes =
    user.role === "ADMIN"
      ? await prisma.user.findMany({
          where: { id: { in: porCloser.map((c) => c.ownerId) } },
          select: { id: true, name: true },
        })
      : [];

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
  const sessoes = await prisma.meeting.findMany({
    where: { ...ownerScope(user), type: "GROUP", startsAt: { gte: from, lt: to } },
    include: {
      owner: { select: { id: true, name: true } },
      template: { select: { name: true } },
      attendees: {
        include: { lead: { select: { id: true, name: true, company: true, score: true } } },
        orderBy: { totalSeconds: "desc" },
      },
    },
    orderBy: { startsAt: "asc" },
    // Uma semana da agenda nova são ~78 sessões, cada uma com até 20 inscritos.
    // Sem teto, uma configuração errada vira uma consulta sem fim numa tela que
    // alguém abre todo dia.
    take: 200,
  });

  return sessoes.map((s) => {
    const inscritos = s.attendees.length;
    const presentes = s.attendees.filter((a) => a.attended).length;
    return {
      ...s,
      inscritos,
      presentes,
      // As réguas vêm de `lib/presenca`, onde já moram as outras. Estavam
      // copiadas aqui, em `SessionsView` e em `SessionDrawer` — e as cópias já
      // discordavam sobre o que era "a taxa".
      taxaPresenca: taxaDaSessao(inscritos, presentes),
      qualificados: s.attendees.filter((a) => a.attended && ehQualificado(a.lead.score)).length,
    };
  });
}

export type AbaDaSessao = "gravacao" | "auditoria" | "sala" | "anotacoes";

/**
 * O detalhe de uma sessão, para a página.
 *
 * **Sem `ownerScope`, de propósito.** A gravação é do time comercial inteiro,
 * não do dono da call: é a decisão que faz o closer novo ouvir a call do closer
 * bom, e é o único jeito de a auditoria servir para treinar alguém. O lead
 * continua sendo de quem é — `getLeadDetail` segue no escopo do dono, então
 * abrir a ficha de alguém da sessão de outro vendedor não devolve nada.
 *
 * `aba` decide o que é sequer consultado. A transcrição de uma call de uma hora
 * tem sessenta mil caracteres, e trazê-la para desenhar o cabeçalho seria pagar
 * por ela em toda visita.
 */
export async function getSessionDetail(user: SessionUser, id: string, aba?: AbaDaSessao) {
  const sessao = await prisma.meeting.findFirst({
    where: { id, type: "GROUP" },
    include: {
      owner: { select: { id: true, name: true } },
      template: { select: { name: true } },
      attendees: {
        include: {
          lead: {
            select: {
              id: true, name: true, company: true, email: true, phone: true,
              score: true, segment: true,
            },
          },
        },
      },
      // A verdade crua da sala, e não só o roster: quem entrou pelo link avulso
      // não é inscrito de ninguém e mesmo assim esteve na call. É daqui que sai
      // quantas pessoas ouviram a oferta.
      presences: {
        select: { identity: true, name: true, joinedAt: true, leftAt: true, seconds: true },
        orderBy: { joinedAt: "asc" },
      },
      gravacoes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, status: true, caminho: true, bytes: true, duracaoSegundos: true,
          iniciadaEm: true, terminadaEm: true, erro: true, apagadaEm: true,
          transcript: {
            select: {
              id: true, createdAt: true, idioma: true, modelo: true,
              // O texto inteiro só quando a aba pede. Ver acima.
              texto: aba === "auditoria" || aba === "gravacao",
              segmentos: aba === "gravacao",
              analise: {
                select: {
                  id: true, createdAt: true, modelo: true, resumo: true, veredicto: true,
                  aderenciaPct: true, notaGeral: true, engajamento: true,
                  blocosOk: true, blocosTotal: true, errosCriticos: true, proibidasCount: true,
                  roleplayFoco: true, insights: true, proximosPassos: true, redigidaEm: true,
                  blocos: aba === "auditoria",
                  erros: aba === "auditoria",
                  vocabulario: aba === "auditoria",
                  objecoes: aba === "auditoria",
                  scorecard: aba === "auditoria",
                },
              },
            },
          },
        },
      },
      // A oferta aparece no resumo da call, sempre: é fato comercial, não log
      // de chat. A conversa inteira só na aba `sala`.
      mensagens: {
        where: aba === "sala" ? {} : { tipo: "OFERTA" },
        orderBy: { createdAt: "asc" },
        take: aba === "sala" ? 500 : 20,
      },
      notes: {
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
  if (!sessao) return null;

  /**
   * Quem é do time vê a call. O CONTATO continua sendo de quem é.
   *
   * A leitura da sessão é do time inteiro de propósito — é isso que faz o
   * closer novo ouvir a call do closer bom. Mas telefone e e-mail não são
   * contexto da gravação: são a lista de contatos da carteira de outra pessoa,
   * e deixá-los aqui abriria pelas Sessões exatamente o que `ownerScope`
   * fecha em `getLeadDetail`, `getSessions` e `getParticipants`. Trinta e três
   * contas conseguiriam colher a base inteira abrindo sessões alheias.
   *
   * Nome e empresa ficam: sem eles não dá para saber quem estava na call, que
   * é o motivo de a gravação ser compartilhada.
   */
  const doDono = user.role === "ADMIN" || sessao.ownerId === user.id;

  return {
    ...sessao,
    /// Se quem está vendo pode agir sobre estes leads. A tela usa para decidir
    /// se desenha os botões de WhatsApp e telefone.
    doDono,
    attendees: sessao.attendees.map((a) => ({
      ...a,
      lead: doDono ? a.lead : { ...a.lead, phone: null, email: null },
    })),
    // `bytes` é BIGINT no banco, e `bigint` não atravessa para um componente:
    // o `JSON.stringify` do Server Component lança "Do not know how to
    // serialize a BigInt" — em runtime, na página inteira, sem aviso de tipo.
    gravacoes: sessao.gravacoes.map((g) => ({ ...g, bytes: g.bytes == null ? null : Number(g.bytes) })),
  };
}

export type SessionDetail = NonNullable<Awaited<ReturnType<typeof getSessionDetail>>>;

// ───────────────────────────── Participantes ─────────────────────────────

/** Leads inscritos em sessões — a base de "quem foi agendado". */
export async function getParticipants(
  user: SessionUser,
  filters: { q?: string; presenca?: string; score?: string },
) {
  const q = filters.q?.trim();

  return prisma.meetingAttendee.findMany({
    where: {
      meeting: { ...ownerScope(user), type: "GROUP" },
      ...(filters.presenca === "presente" ? { attended: true } : {}),
      ...(filters.presenca === "ausente" ? { attended: false } : {}),
      ...(filters.score && filters.score !== "all" ? { lead: { score: filters.score } } : {}),
      ...(q
        ? {
            lead: {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { email: { contains: q, mode: "insensitive" as const } },
                { company: { contains: q, mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
    },
    include: {
      lead: {
        select: {
          id: true, name: true, email: true, phone: true,
          company: true, segment: true, score: true,
        },
      },
      meeting: {
        // `endsAt` e `status` entram porque a tela precisa de `situacaoDaSessao`:
        // sem eles ela só sabia "começou ou não", e marcava todo mundo de
        // Ausente enquanto a call ainda estava rolando.
        select: {
          id: true, startsAt: true, endsAt: true, status: true,
          owner: { select: { name: true } },
        },
      },
    },
    orderBy: { meeting: { startsAt: "desc" } },
    take: 300,
  });
}

// ─────────────────────────── Painel do líder ───────────────────────────

/** Visão do time: quem está onde, com o que trava a operação hoje. */
export async function getTeamOverview() {
  const agora = new Date();
  // `new Date(ano, getMonth(), 1)` lê o relógio do processo: na Vercel, nas
  // três últimas horas de todo mês, já é o mês seguinte — e o painel zerava
  // "ganho no mês" para quem ainda estava no dia 31. `lib/horizonte` já
  // documentava exatamente isso; aqui a regra não estava sendo seguida.
  const inicioMes = inicioDoMes(agora);
  const inicioSemana = weekStart(agora);

  const [closers, ganhos, abertos, tarefas, reunioes] = await Promise.all([
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
      // O `lt` faltava, e o campo chama-se `reunioesSemana`: sem ele a conta
      // incluía TODA sessão futura do mês. O painel do líder mostrava ~78 por
      // closer contra ~13 no dashboard do mesmo closer, para a mesma pergunta.
      where: {
        startsAt: { gte: inicioSemana, lt: addDays(inicioSemana, 7) },
        status: { not: "CANCELED" },
      },
      _count: true,
    }),
  ]);

  const linhas = closers.map((c) => {
    const g = ganhos.find((x) => x.ownerId === c.id);
    const a = abertos.find((x) => x.ownerId === c.id);
    const minhas = tarefas.filter((t) => t.ownerId === c.id);

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
    };
  });

  return {
    linhas: linhas.sort((a, b) => b.ganhoCents - a.ganhoCents),
    totalGanhoCents: linhas.reduce((s, l) => s + l.ganhoCents, 0),
    totalGanhos: linhas.reduce((s, l) => s + l.ganhos, 0),
    totalAtrasadas: linhas.reduce((s, l) => s + l.atrasadas, 0),
  };
}

// ───────────────────── Configuração da operação ─────────────────────

export async function getConfig() {
  const [stages, lossReasons, templates, automations, cases, series, regra] = await Promise.all([
    prisma.stage.findMany({ orderBy: { order: "asc" }, include: { _count: { select: { deals: true } } } }),
    prisma.lossReason.findMany({ orderBy: { orderIndex: "asc" }, include: { _count: { select: { deals: true } } } }),
    prisma.taskTemplate.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { tasks: true } } } }),
    prisma.taskAutomation.findMany({
      include: { template: { select: { name: true } }, targetStage: { select: { name: true, color: true } } },
    }),
    prisma.case.findMany({ orderBy: { segment: "asc" } }),
    prisma.sessionTemplate.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: {
        owner: { select: { id: true, name: true } },
        _count: { select: { meetings: true } },
      },
    }),
    // A régua de presença. Era lida por três telas e escrita por nenhuma —
    // `getConfig` nem sequer tocava na tabela `Config`.
    prisma.config.upsert({ where: { id: "unica" }, update: {}, create: {} }),
  ]);

  return { stages, lossReasons, templates, automations, cases, series, regra };
}

/**
 * Erros recentes do servidor, para a tela de diagnóstico.
 *
 * A contagem de 24h é separada da lista: é ela que decide se o aviso aparece
 * no início, e contar o que veio na página daria um número menor que a verdade.
 */
export async function getErrosRecentes() {
  const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [erros, ultimas24h] = await Promise.all([
    prisma.errorLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.errorLog.count({ where: { createdAt: { gte: ontem } } }),
  ]);
  return { erros, ultimas24h };
}

/** Só a contagem, para o aviso no início — sem carregar as mensagens. */
export async function contarErros24h() {
  const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.errorLog.count({ where: { createdAt: { gte: ontem } } });
}

/**
 * As versões da rubrica de auditoria, da mais nova para a mais velha.
 *
 * Todas, e não só a ativa: as antigas ficam porque são elas que explicam as
 * notas que deram. Uma análise de três meses atrás foi julgada por um texto que
 * talvez não seja mais o que está em vigor, e apagar esse texto tornaria a nota
 * impossível de defender.
 */
export async function getRubricas() {
  return prisma.aiPrompt.findMany({
    where: { tipo: "AUDITORIA" },
    orderBy: { versao: "desc" },
    take: 20,
    select: {
      id: true, versao: true, ativo: true, corpo: true, createdAt: true,
      autor: { select: { name: true } },
    },
  });
}
