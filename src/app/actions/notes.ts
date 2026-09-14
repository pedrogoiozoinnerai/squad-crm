"use server";

import { revalidatePath } from "next/cache";

import { text } from "@/lib/forms";
import { assertOwns, currentUser, logActivity, revalidateBoth, type FormState } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export async function addNote(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await currentUser();

  const content = String(formData.get("content") ?? "").trim();
  if (content.length < 2) return { error: "Escreva a anotação." };

  const leadId = text(formData.get("leadId"));
  const dealId = text(formData.get("dealId"));
  if (!leadId && !dealId) return { error: "Anotação sem lead ou negócio." };

  if (dealId) {
    const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { ownerId: true } });
    if (!deal) return { error: "Negócio não encontrado." };
    assertOwns(user, deal.ownerId);
  } else if (leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { ownerId: true } });
    if (!lead) return { error: "Lead não encontrado." };
    assertOwns(user, lead.ownerId);
  }

  await prisma.note.create({ data: { content, authorId: user.id, leadId, dealId } });
  await logActivity({
    kind: "NOTE_ADDED",
    title: "Anotação adicionada",
    detail: content.slice(0, 140),
    authorId: user.id,
    leadId,
    dealId,
  });

  revalidateBoth(revalidatePath, "leads", "pipeline");
  return { ok: true };
}
