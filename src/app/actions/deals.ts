"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { date, moneyCents, text } from "@/lib/forms";
import {
  assertOwns,
  currentUser,
  logActivity,
  revalidateBoth,
  type FormState,
} from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { runStageAutomations } from "@/lib/automations";

const moveSchema = z.object({
  dealId: z.string().min(1),
  stageId: z.string().min(1),
});

/**
 * Move um deal de etapa. Server Actions são alcançáveis por POST direto,
 * então a autorização é verificada aqui dentro — não só na UI.
 */
export async function moveDeal(input: { dealId: string; stageId: string }) {
  const user = await currentUser();
  const { dealId, stageId } = moveSchema.parse(input);

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true, ownerId: true, stageId: true, leadId: true, status: true,
      stage: { select: { name: true } },
    },
  });
  if (!deal) throw new Error("Negócio não encontrado.");
  assertOwns(user, deal.ownerId);
  // O kanban já desabilita, mas a action é alcançável por POST direto.
  if (deal.status !== "OPEN") {
    throw new Error("Negócio fechado não muda de etapa. Reabra antes.");
  }
  if (deal.stageId === stageId) return;

  const stage = await prisma.stage.findUnique({ where: { id: stageId } });
  if (!stage) throw new Error("Etapa inválida.");

  await prisma.$transaction([
    prisma.deal.update({ where: { id: dealId }, data: { stageId } }),
    prisma.dealStageHistory.create({
      data: { dealId, fromStage: deal.stageId, toStage: stageId, movedBy: user.id },
    }),
  ]);

  await logActivity({
    kind: "STAGE_CHANGED",
    title: `Movido para ${stage.name}`,
    detail: `Antes: ${deal.stage.name}`,
    authorId: user.id,
    leadId: deal.leadId,
    dealId,
  });

  // A etapa carrega o próximo passo junto.
  await runStageAutomations({
    dealId,
    leadId: deal.leadId,
    stageId,
    ownerId: deal.ownerId,
    actorId: user.id,
  });

  revalidateBoth(revalidatePath, "pipeline", "deals", "leads", "tarefas");
}

/** Edita os dados comerciais do negócio. */
export async function saveDeal(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await currentUser();
  const id = String(formData.get("id"));

  const deal = await prisma.deal.findUnique({
    where: { id },
    select: { ownerId: true, leadId: true, status: true },
  });
  if (!deal) return { error: "Negócio não encontrado." };
  assertOwns(user, deal.ownerId);
  if (deal.status !== "OPEN") {
    return { error: "Negócio fechado é somente leitura. Reabra para editar." };
  }

  const valorBruto = formData.get("value");
  const valueCents = moneyCents(valorBruto);
  if (valueCents !== null && valueCents < 0) return { error: "O valor não pode ser negativo." };
  // Campo vazio é intenção de zerar; campo preenchido que não vira número é
  // engano de digitação. Sem esta distinção os dois salvavam R$ 0,00, e o
  // vendedor só descobria ao ver a previsão do mês menor do que deveria.
  if (valueCents === null && text(valorBruto) !== null) {
    return { error: "Valor inválido. Use apenas números, como 12.500,00." };
  }

  const probability = Number(formData.get("probability"));
  if (!Number.isFinite(probability) || probability < 0 || probability > 100) {
    return { error: "A probabilidade precisa estar entre 0 e 100." };
  }

  const ATTENDANCE = ["AGENDADO", "PARTICIPOU", "NAO_COMPARECEU"] as const;
  const MENTORSHIP = ["PENDENTE", "AGENDADA", "CONCLUIDA"] as const;

  const attendance = String(formData.get("attendance") ?? "AGENDADO");
  const mentorship = String(formData.get("mentorshipStatus") ?? "PENDENTE");

  await prisma.deal.update({
    where: { id },
    data: {
      valueCents: valueCents ?? 0,
      product: text(formData.get("product")),
      probability,
      expectedAt: date(formData.get("expectedAt")),
      paymentMethod: text(formData.get("paymentMethod")),
      paymentLink: text(formData.get("paymentLink")),
      attendance: (ATTENDANCE as readonly string[]).includes(attendance)
        ? (attendance as (typeof ATTENDANCE)[number])
        : "AGENDADO",
      mentorshipStatus: (MENTORSHIP as readonly string[]).includes(mentorship)
        ? (mentorship as (typeof MENTORSHIP)[number])
        : "PENDENTE",
    },
  });

  await logActivity({
    kind: "DEAL_UPDATED",
    title: "Negócio atualizado",
    authorId: user.id,
    leadId: deal.leadId,
    dealId: id,
  });

  revalidateBoth(revalidatePath, "pipeline", "deals");
  return { ok: true };
}

/** Fecha o negócio como ganho ou perdido. */
export async function closeDeal(formData: FormData) {
  const user = await currentUser();
  const id = String(formData.get("id"));
  const won = formData.get("outcome") === "won";
  const lossReasonId = text(formData.get("lossReasonId"));
  const note = text(formData.get("reason"));

  const deal = await prisma.deal.findUnique({
    where: { id },
    select: { ownerId: true, leadId: true, mentorshipStatus: true, status: true },
  });
  if (!deal) throw new Error("Negócio não encontrado.");
  assertOwns(user, deal.ownerId);
  if (deal.status !== "OPEN") throw new Error("Este negócio já está fechado.");

  // Regra do produto: não se marca Ganho sem a mentoria estratégica concluída.
  if (won && deal.mentorshipStatus !== "CONCLUIDA") {
    throw new Error("Conclua a Mentoria Estratégica antes de marcar o negócio como ganho.");
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.deal.update({
      where: { id },
      data: won
        ? { status: "WON", wonAt: now, probability: 100, lostNote: null, lossReasonId: null, lostAt: null }
        : { status: "LOST", lostAt: now, lostNote: note, lossReasonId },
    }),
    prisma.lead.update({
      where: { id: deal.leadId },
      data: { status: won ? "CONVERTED" : "LOST" },
    }),
  ]);

  await logActivity({
    kind: won ? "DEAL_WON" : "DEAL_LOST",
    title: won ? "Negócio ganho" : "Negócio perdido",
    detail: note,
    authorId: user.id,
    leadId: deal.leadId,
    dealId: id,
  });

  revalidateBoth(revalidatePath, "pipeline", "deals", "leads");
}

/** Devolve um negócio fechado para o pipeline aberto. */
export async function reopenDeal(formData: FormData) {
  const user = await currentUser();
  const id = String(formData.get("id"));

  const deal = await prisma.deal.findUnique({
    where: { id },
    select: { ownerId: true, leadId: true, status: true, stage: { select: { name: true } } },
  });
  if (!deal) throw new Error("Negócio não encontrado.");
  assertOwns(user, deal.ownerId);
  if (deal.status === "OPEN") throw new Error("Este negócio já está aberto.");

  await prisma.$transaction([
    prisma.deal.update({
      where: { id },
      // Reabrir devolve a probabilidade da etapa; deixar 100% herdado do Ganho
      // inflaria o forecast de um negócio que voltou a ser incerto.
      data: {
        status: "OPEN", wonAt: null, lostAt: null, lostNote: null, lossReasonId: null,
        probability: 20,
      },
    }),
    prisma.lead.update({ where: { id: deal.leadId }, data: { status: "COMPLETE" } }),
  ]);

  revalidateBoth(revalidatePath, "pipeline", "deals", "leads");
}
