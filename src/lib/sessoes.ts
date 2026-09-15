import "server-only";

import { prisma } from "@/lib/prisma";
import { slotsDaSerie } from "@/lib/slots";

export type RelatorioDeMaterializacao = {
  templates: number;
  criadas: number;
  jaExistiam: number;
};

/// Teto por execução: um horizonte mal configurado não pode virar mil linhas.
const POR_TEMPLATE = 60;

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
  opcoes: { templateId?: string; horizonteDias?: number } = {},
): Promise<RelatorioDeMaterializacao> {
  const templates = await prisma.sessionTemplate.findMany({
    where: { active: true, ...(opcoes.templateId ? { id: opcoes.templateId } : {}) },
  });

  const relatorio: RelatorioDeMaterializacao = { templates: 0, criadas: 0, jaExistiam: 0 };

  for (const t of templates) {
    relatorio.templates += 1;

    const dias = opcoes.horizonteDias ?? t.horizonDays;
    const ate = new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000);
    const slots = slotsDaSerie(t, agora, ate).slice(0, POR_TEMPLATE);
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

/** O schema do app, já validado na subida do cliente. */
function schema() {
  return process.env.DB_SCHEMA?.replace(/"/g, "") || "crm";
}
