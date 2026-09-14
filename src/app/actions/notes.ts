"use server";

import { revalidatePath } from "next/cache";

import { text } from "@/lib/forms";
import { assertOwnsContext, currentUser, logActivity, revalidateBoth, type FormState } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export async function addNote(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await currentUser();

  const content = String(formData.get("content") ?? "").trim();
  if (content.length < 2) return { error: "Escreva a anotação." };

  const leadId = text(formData.get("leadId"));
  const dealId = text(formData.get("dealId"));
  if (!leadId && !dealId) return { error: "Anotação sem lead ou negócio." };

  // Valida lead E negócio — quem chama a action escolhe o corpo do POST.
  await assertOwnsContext(user, { leadId, dealId });

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
