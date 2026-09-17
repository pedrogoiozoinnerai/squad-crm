import "server-only";

import { novoTokenDeConvite } from "@/lib/codes";
import { TZ } from "@/lib/dates";
import { horizonteDaAgenda } from "@/lib/horizonte";
import { prisma } from "@/lib/prisma";
import {
  motivoParaNaoRemarcar,
  type ResultadoDaRemarcacao,
} from "@/lib/remarcacao";
import { slotsDaSerie } from "@/lib/slots";

export type RelatorioDeMaterializacao = {
  templates: number;
  criadas: number;
  jaExistiam: number;
  /// Séries cuja geração bateu no teto — o fim do mês pode ter ficado de fora.
  truncadas: string[];
};

/// Teto por execução, por série.
///
/// A janela máxima é um mês: 13 horários × 31 dias = 403 no pior caso. 650
/// cobre isso com folga e ainda corta uma série disparatada antes que ela vire
/// mil linhas por engano.
///
/// Era 60, de quando a série tinha um horário só — e 60 truncaria a agenda no
/// quinto dia do mês sem dizer nada.
const POR_TEMPLATE = 650;

/**
 * Transforma as séries recorrentes em reuniões concretas.
 *
 * Idempotente pelo `@@unique([templateId, startsAt])`: rodar duas vezes no
 * mesmo minuto não cria nada. É o que permite chamar tanto pelo cron quanto na
 * hora em que alguém salva o template — o closer vê a grade na hora, sem
 * esperar a madrugada.
 *
 * Nunca mexe no que já existe. Uma sessão que o time cancelou ou moveu de dono
 * continua como está: materializar de novo por cima desfaria a decisão de
 * alguém.
 */
export async function materializarSessoes(
  agora = new Date(),
  opcoes: { templateId?: string; ate?: Date } = {},
): Promise<RelatorioDeMaterializacao> {
  const templates = await prisma.sessionTemplate.findMany({
    where: { active: true, ...(opcoes.templateId ? { id: opcoes.templateId } : {}) },
  });

  const relatorio: RelatorioDeMaterializacao = {
    templates: 0,
    criadas: 0,
    jaExistiam: 0,
    truncadas: [],
  };

  for (const t of templates) {
    relatorio.templates += 1;

    // O horizonte vem de `lib/horizonte`, que é a MESMA função que a rota
    // pública de disponibilidade chama. Antes eram duas regras — 28 dias aqui,
    // 21 lá — e materializar mais do que se mostra é desperdício, enquanto
    // mostrar mais do que se materializa é lista com buraco.
    const ate =
      opcoes.ate ??
      (t.horizonte === "DIAS"
        ? new Date(agora.getTime() + t.horizonDias * 24 * 60 * 60 * 1000)
        : horizonteDaAgenda(agora, t.timezone));

    const todos = slotsDaSerie(t, agora, ate);
    const slots = todos.slice(0, POR_TEMPLATE);
    if (todos.length > POR_TEMPLATE) {
      // O corte tira a CAUDA, que é o fim do mês — justamente o que a agenda
      // promete cobrir. Silenciar isso só seria descoberto por um lead sem
      // horário no dia 28.
      relatorio.truncadas.push(t.name);
      console.warn(
        `[sessoes] série "${t.name}" gerou ${todos.length} slots e foi cortada em ${POR_TEMPLATE}: o fim da janela ficou de fora.`,
      );
    }
    if (slots.length === 0) continue;

    const existentes = new Set(
      (
        await prisma.meeting.findMany({
          where: { templateId: t.id, startsAt: { gte: agora, lte: ate } },
          select: { startsAt: true },
        })
      ).map((m) => m.startsAt.getTime()),
    );

    const novas = slots.filter((s) => !existentes.has(s.getTime()));
    relatorio.jaExistiam += slots.length - novas.length;
    if (novas.length === 0) continue;

    // `skipDuplicates` como segunda rede: dois crons sobrepostos, ou o cron e
    // o salvamento do template ao mesmo tempo, chegariam aqui juntos.
    const { count } = await prisma.meeting.createMany({
      data: novas.map((inicio) => ({
        title: t.name,
        startsAt: inicio,
        endsAt: new Date(inicio.getTime() + t.durationMin * 60_000),
        type: "GROUP" as const,
        ownerId: t.ownerId,
        capacity: t.capacity,
        templateId: t.id,
        // O link nasce com a sessão, como nasce com a reunião avulsa. Sem
        // isto as sessões do funil — que são a maioria da agenda — seriam
        // justamente as únicas sem link para mandar.
        guestToken: novoTokenDeConvite(),
      })),
      skipDuplicates: true,
    });
    relatorio.criadas += count;
  }

  return relatorio;
}

export type ResultadoDeInscricao =
  | { situacao: "inscrito"; token: string }
  | { situacao: "ja_inscrito"; token: string }
  | { situacao: "lotada" };

/**
 * Inscreve um lead numa sessão coletiva.
 *
 * A lotação é conferida numa instrução só, não com `count` seguido de
 * `create`: duas inscrições simultâneas com uma vaga passariam as duas.
 */
export async function inscrever(
  meetingId: string,
  leadId: string,
  token: string,
): Promise<ResultadoDeInscricao> {
  const ja = await prisma.meetingAttendee.findUnique({
    where: { meetingId_leadId: { meetingId, leadId } },
    select: { inviteToken: true },
  });
  if (ja) return { situacao: "ja_inscrito", token: ja.inviteToken };

  const reuniao = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { capacity: true },
  });
  if (!reuniao) return { situacao: "lotada" };

  // Sem capacidade declarada não há o que lotar — é o caso das 1:1.
  if (reuniao.capacity === null) {
    await prisma.meetingAttendee.create({
      data: { meetingId, leadId, inviteToken: token, invitedAt: new Date() },
    });
    return { situacao: "inscrito", token };
  }

  const linhas = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "${schema()}"."MeetingAttendee"
       ("id","meetingId","leadId","inviteToken","status","source","invitedAt","createdAt")
     SELECT $1, $2, $3, $4, 'INSCRITO', 'INSCRICAO', now(), now()
      WHERE (SELECT count(*) FROM "${schema()}"."MeetingAttendee"
              WHERE "meetingId" = $2 AND status IN ('INSCRITO','CONFIRMADO')) < $5
     ON CONFLICT ("meetingId","leadId") DO NOTHING
     RETURNING id`,
    crypto.randomUUID(),
    meetingId,
    leadId,
    token,
    reuniao.capacity,
  );

  return linhas.length > 0 ? { situacao: "inscrito", token } : { situacao: "lotada" };
}

/**
 * Quanto tempo antes do início a sessão para de aceitar inscrição.
 *
 * Cinco minutos. Era uma hora — e uma hora escondia justamente a sessão que a
 * pessoa mais quer: às 09:53 o funil não oferecia a das 10:00, e o primeiro
 * horário da tela era o das 11:00. A sala das 10:00 já estava aberta desde
 * 09:30, com vinte vagas livres, e ninguém conseguia entrar nela.
 *
 * A hora existia para o time ver o nome na agenda antes de entrar. Esse motivo
 * caiu: a reserva cria o lead no CRM no mesmo instante do clique — não espera o
 * cron — e a sala abre 30 minutos antes do início. Quem reserva às 09:53 entra
 * em seguida.
 *
 * Os cinco minutos que sobram servem a uma coisa só: não vender a vaga de uma
 * sessão que começa enquanto a página carrega.
 */
export const ANTECEDENCIA_MIN = 5;

/// Teto de linhas. Fica logo acima do que uma série materializa num mês (650),
/// para uma configuração errada não virar um JSON de megabytes.
export const TETO_SESSOES = 700;

export type SessaoComVaga = {
  id: string;
  inicioEm: Date;
  duracaoMin: number;
  lotacao: number;
  inscritos: number;
  vagas: number;
};

/**
 * As sessões que ainda aceitam gente.
 *
 * Mora aqui, e não na rota, porque agora são DOIS lugares que precisam da mesma
 * lista: o funil, para agendar, e a página de remarcar, para trocar de horário.
 * Duas cópias desta consulta divergiriam — foi exatamente o que aconteceu com o
 * horizonte, que valia 28 dias no materializador e 21 na rota.
 */
export async function sessoesComVaga(
  agora = new Date(),
  recorte?: { de?: Date; ate?: Date },
): Promise<SessaoComVaga[]> {
  const abre = new Date(agora.getTime() + ANTECEDENCIA_MIN * 60_000);
  const fecha = horizonteDaAgenda(agora);

  // O recorte só ESTREITA: nunca alarga o que a agenda abre.
  const de = recorte?.de && recorte.de > abre ? recorte.de : abre;
  const ate = recorte?.ate && recorte.ate < fecha ? recorte.ate : fecha;
  if (ate <= de) return [];

  const sessoes = await prisma.meeting.findMany({
    where: {
      type: "GROUP",
      status: "SCHEDULED",
      startsAt: { gte: de, lte: ate },
      capacity: { not: null },
    },
    orderBy: { startsAt: "asc" },
    take: TETO_SESSOES,
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      _count: {
        select: { attendees: { where: { status: { in: ["INSCRITO", "CONFIRMADO"] } } } },
      },
    },
  });

  return sessoes
    .map((s) => ({
      id: s.id,
      inicioEm: s.startsAt,
      duracaoMin: Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60_000),
      lotacao: s.capacity ?? 0,
      inscritos: s._count.attendees,
      vagas: Math.max(0, (s.capacity ?? 0) - s._count.attendees),
    }))
    .filter((s) => s.vagas > 0);
}

/**
 * Move uma inscrição para outra sessão, mantendo o mesmo convite.
 *
 * O `inviteToken` NÃO muda: o link que o lead guardou, o que está no `.ics` e o
 * que ele mandou para um colega continuam valendo. Trocar o token faria a
 * remarcação invalidar exatamente o que a pessoa acabou de salvar.
 *
 * A troca é UMA instrução com a conferência de lotação dentro, igual a
 * `inscrever` e pelo mesmo motivo: entre ler "tem vaga" e gravar, outra pessoa
 * pode ter entrado. Duas sessões cheias a 20 lugares com 600 inscrições por dia
 * não é hipótese — é terça-feira.
 */
export async function remarcar(
  inviteToken: string,
  novoMeetingId: string,
  agora = new Date(),
): Promise<ResultadoDaRemarcacao> {
  const inscricao = await prisma.meetingAttendee.findUnique({
    where: { inviteToken },
    select: {
      id: true,
      status: true,
      meetingId: true,
      leadId: true,
      meeting: { select: { startsAt: true } },
    },
  });
  if (!inscricao) return { tipo: "indisponivel" };

  const motivo = motivoParaNaoRemarcar(inscricao);
  if (motivo) return { tipo: "recusado", motivo };

  if (inscricao.meetingId === novoMeetingId) {
    // Clique repetido, ou a pessoa escolheu o horário em que já está. Não é
    // erro, e gastar uma `versao` por isso faria o calendário dela piscar.
    return { tipo: "ok", meetingId: novoMeetingId };
  }

  const alvo = await prisma.meeting.findUnique({
    where: { id: novoMeetingId },
    select: { id: true, capacity: true, status: true, startsAt: true, type: true },
  });
  if (!alvo || alvo.status !== "SCHEDULED" || alvo.type !== "GROUP") {
    return { tipo: "indisponivel" };
  }
  // Não dá para remarcar para trás. A sessão que já começou continua fora,
  // mesmo que a régua de entrada a aceitasse: escolher um horário que já passou
  // é sempre engano de quem clica.
  if (alvo.startsAt <= agora) return { tipo: "indisponivel" };

  const linhas = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `UPDATE "${schema()}"."MeetingAttendee"
        SET "meetingId" = $2,
            versao = versao + 1,
            status = 'INSCRITO',
            "confirmedAt" = NULL,
            -- Os campos derivados são da reunião ANTIGA. Sem zerar, o roster da
            -- sessão nova nasceria dizendo que a pessoa já compareceu.
            "joinedAt" = NULL,
            "leftAt" = NULL,
            "joinCount" = 0,
            "totalSeconds" = 0,
            attended = false,
            "regraMinutos" = NULL
      WHERE "inviteToken" = $1
        AND status <> 'CANCELADO'
        AND ($3::int IS NULL
             OR (SELECT count(*) FROM "${schema()}"."MeetingAttendee"
                  WHERE "meetingId" = $2 AND status IN ('INSCRITO','CONFIRMADO')) < $3)
      RETURNING id`,
    inviteToken,
    novoMeetingId,
    alvo.capacity,
  );

  if (linhas.length === 0) return { tipo: "lotada" };

  // O vendedor precisa ver que mudou, e de onde para onde: um lead que aparece
  // noutra sessão sem explicação parece erro do sistema.
  const quando = (d: Date) =>
    d.toLocaleString("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" });
  await prisma.activity
    .create({
      data: {
        kind: "MEETING_SCHEDULED",
        title: `Remarcou a sessão para ${quando(alvo.startsAt)}`,
        detail: inscricao.meeting
          ? `antes era ${quando(inscricao.meeting.startsAt)} · pelo próprio convite`
          : "pelo próprio convite",
        leadId: inscricao.leadId,
      },
    })
    // A remarcação JÁ aconteceu. Falhar aqui não pode desfazê-la nem devolver
    // erro para quem acabou de ver o horário mudar na tela.
    .catch((erro) => console.error("[sessoes] remarcação sem registro na linha do tempo:", erro));

  return { tipo: "ok", meetingId: novoMeetingId };
}

/** O schema do app, já validado na subida do cliente. */
function schema() {
  return process.env.DB_SCHEMA?.replace(/"/g, "") || "crm";
}
