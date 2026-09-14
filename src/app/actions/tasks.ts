"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { date, text } from "@/lib/forms";
import {
  assertOwns,
  assertOwnsContext,
  currentUser,
  logActivity,
  revalidateBoth,
  type FormState,
} from "@/lib/guard";
import { prisma } from "@/lib/prisma";

const toggleSchema = z.object({ taskId: z.string().min(1) });

/** Alterna entre pendente e concluída. Autorização verificada no servidor. */
export async function toggleTask(formData: FormData) {
  const user = await currentUser();
  const { taskId } = toggleSchema.parse({ taskId: formData.get("taskId") });

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, ownerId: true, status: true, subject: true, leadId: true, dealId: true },
  });
  if (!task) throw new Error("Tarefa não encontrada.");
  assertOwns(user, task.ownerId);

  const done = task.status === "DONE";
  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: done ? "PENDING" : "DONE",
      completedAt: done ? null : new Date(),
    },
  });

  if (!done) {
    await logActivity({
      kind: "TASK_DONE",
      title: `Tarefa concluída: ${task.subject}`,
      authorId: user.id,
      leadId: task.leadId,
      dealId: task.dealId,
    });
  }

  revalidateBoth(revalidatePath, "tarefas", "pipeline", "agenda");
}

const TYPES = ["follow_up", "call_individual", "call", "message"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export async function createTask(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await currentUser();

  const subject = String(formData.get("subject") ?? "").trim();
  if (subject.length < 2) return { error: "Descreva a tarefa." };

  const leadId = text(formData.get("leadId"));
  const dealId = text(formData.get("dealId"));

  // Valida lead E negócio, e herda o dono do registro a que a tarefa se prende.
  const { ownerId } = await assertOwnsContext(user, { leadId, dealId });

  const type = String(formData.get("type") ?? "follow_up");
  const priority = String(formData.get("priority") ?? "MEDIUM");

  await prisma.task.create({
    data: {
      subject,
      type: (TYPES as readonly string[]).includes(type) ? type : "follow_up",
      priority: (PRIORITIES as readonly string[]).includes(priority)
        ? (priority as (typeof PRIORITIES)[number])
        : "MEDIUM",
      dueAt: date(formData.get("dueAt")),
      ownerId,
      leadId,
      dealId,
    },
  });

  await logActivity({
    kind: "TASK_CREATED",
    title: `Tarefa criada: ${subject}`,
    authorId: user.id,
    leadId,
    dealId,
  });

  revalidateBoth(revalidatePath, "tarefas", "pipeline", "leads", "agenda");
  return { ok: true };
}

export async function deleteTask(formData: FormData) {
  const user = await currentUser();
  const id = String(formData.get("taskId"));

  const task = await prisma.task.findUnique({ where: { id }, select: { ownerId: true } });
  if (!task) throw new Error("Tarefa não encontrada.");
  assertOwns(user, task.ownerId);

  await prisma.task.delete({ where: { id } });
  revalidateBoth(revalidatePath, "tarefas", "pipeline", "leads", "agenda");
}
