"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertOwns, currentUser, logActivity, revalidateBoth, type FormState } from "@/lib/guard";
import { date, moneyCents, phone, text } from "@/lib/forms";
import { nextDealCode } from "@/lib/codes";
import { prisma } from "@/lib/prisma";
import { runStageAutomations } from "@/lib/automations";

const SCORES = ["A", "B", "C", "D", "E"] as const;

const leadSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do lead."),
  email: z.string().trim().email("E-mail inválido.").nullable(),
  score: z.enum(SCORES).nullable(),
});

function readLead(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    email: text(formData.get("email")),
    phone: phone(formData.get("phone")),
    company: text(formData.get("company")),
    jobTitle: text(formData.get("jobTitle")),
    segment: text(formData.get("segment")),
    revenueRange: text(formData.get("revenueRange")),
    score: text(formData.get("score")),
    source: text(formData.get("source")),
    notes: text(formData.get("notes")),
  };
}

/** Um lead é "completo" quando dá para trabalhar: nome, contato e empresa. */
function completeness(lead: { phone: string | null; email: string | null; company: string | null }) {
  return (lead.phone || lead.email) && lead.company ? "COMPLETE" : "INCOMPLETE";
}

export async function saveLead(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await currentUser();
  const id = text(formData.get("id"));
  const raw = readLead(formData);

  const parsed = leadSchema.safeParse({ name: raw.name, email: raw.email, score: raw.score });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const ownerId = user.role === "ADMIN" ? (text(formData.get("ownerId")) ?? user.id) : user.id;

  if (id) {
    const existing = await prisma.lead.findUnique({ where: { id }, select: { ownerId: true, status: true } });
    if (!existing) return { error: "Lead não encontrado." };
    assertOwns(user, existing.ownerId);

    await prisma.lead.update({
      where: { id },
      data: {
        ...raw,
        ownerId,
        // Não rebaixa um lead já convertido/perdido só porque faltou um campo.
        status: existing.status === "INCOMPLETE" || existing.status === "COMPLETE"
          ? completeness(raw)
          : existing.status,
      },
    });

    await logActivity({
      kind: "LEAD_UPDATED",
      title: "Lead atualizado",
      authorId: user.id,
      leadId: id,
    });
  } else {
    const lead = await prisma.lead.create({
      data: { ...raw, ownerId, status: completeness(raw) },
    });

    await logActivity({
      kind: "LEAD_CREATED",
      title: "Lead cadastrado",
      detail: raw.source ? `Origem: ${raw.source}` : null,
      authorId: user.id,
      leadId: lead.id,
    });
  }

  revalidateBoth(revalidatePath, "leads", "pipeline");
  return { ok: true };
}

export async function markLeadLost(formData: FormData) {
  const user = await currentUser();
  const id = String(formData.get("id"));
  const reason = text(formData.get("reason"));

  const lead = await prisma.lead.findUnique({ where: { id }, select: { ownerId: true } });
  if (!lead) throw new Error("Lead não encontrado.");
  assertOwns(user, lead.ownerId);

  await prisma.lead.update({ where: { id }, data: { status: "LOST" } });
  await logActivity({
    kind: "DEAL_LOST",
    title: "Lead marcado como perdido",
    detail: reason,
    authorId: user.id,
    leadId: id,
  });

  revalidateBoth(revalidatePath, "leads", "pipeline");
}

/** Promove o lead a negócio na primeira etapa do pipeline. */
export async function convertLead(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await currentUser();
  const leadId = String(formData.get("leadId"));

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      name: true,
      ownerId: true,
      // Só os abertos bloqueiam: um lead cujo negócio foi ganho ou perdido
      // pode voltar ao pipeline — é renovação, upsell, segunda tentativa.
      deals: { where: { status: "OPEN" }, select: { id: true } },
    },
  });
  if (!lead) return { error: "Lead não encontrado." };
  assertOwns(user, lead.ownerId);
  if (lead.deals.length) return { error: "Este lead já tem um negócio aberto no pipeline." };

  const stage = await prisma.stage.findFirst({ orderBy: { order: "asc" } });
  if (!stage) return { error: "Nenhuma etapa de pipeline configurada." };

  const valueCents = moneyCents(formData.get("value")) ?? 0;
  const expectedAt = date(formData.get("expectedAt"));

  const deal = await prisma.deal.create({
    data: {
      code: await nextDealCode(),
      leadId: lead.id,
      stageId: stage.id,
      valueCents,
      product: text(formData.get("product")),
      probability: Number(formData.get("probability")) || 20,
      expectedAt,
      ownerId: lead.ownerId ?? user.id,
    },
  });

  await prisma.lead.update({ where: { id: leadId }, data: { status: "CONVERTED" } });
  await logActivity({
    kind: "DEAL_CREATED",
    title: `Negócio criado em ${stage.name}`,
    authorId: user.id,
    leadId: lead.id,
    dealId: deal.id,
  });

  await runStageAutomations({
    dealId: deal.id,
    leadId: lead.id,
    stageId: stage.id,
    ownerId: deal.ownerId,
    actorId: user.id,
  });

  revalidateBoth(revalidatePath, "leads", "pipeline", "deals", "tarefas");
  return { ok: true };
}
