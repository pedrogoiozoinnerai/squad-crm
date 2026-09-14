import "server-only";

import { addDays } from "date-fns";

import { logActivity } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

/**
 * Ao entrar numa etapa, cria as tarefas configuradas para ela.
 *
 * É o que faz o pipeline andar sem depender da disciplina do vendedor: a etapa
 * carrega o próximo passo junto. Idempotente por (deal, template, etapa) — mover
 * o card de ida e volta não duplica tarefa.
 */
export async function runStageAutomations(input: {
  dealId: string;
  leadId: string;
  stageId: string;
  ownerId: string;
  actorId: string;
}) {
  const automations = await prisma.taskAutomation.findMany({
    where: { targetStageId: input.stageId, active: true, template: { active: true } },
    include: { template: true },
  });
  if (automations.length === 0) return 0;

  const jaCriadas = await prisma.task.findMany({
    where: {
      dealId: input.dealId,
      automated: true,
      templateId: { in: automations.map((a) => a.templateId) },
    },
    select: { templateId: true },
  });
  const conhecidos = new Set(jaCriadas.map((t) => t.templateId));

  const pendentes = automations.filter((a) => !conhecidos.has(a.templateId));
  if (pendentes.length === 0) return 0;

  for (const automation of pendentes) {
    const { template } = automation;

    await prisma.task.create({
      data: {
        subject: template.name,
        type: template.type,
        priority: template.priority,
        dueAt: addDays(new Date(), automation.dueInDays),
        ownerId: input.ownerId,
        dealId: input.dealId,
        leadId: input.leadId,
        templateId: template.id,
        automated: true,
      },
    });

    await logActivity({
      kind: "TASK_CREATED",
      title: `Tarefa automática: ${template.name}`,
      detail: template.description,
      authorId: input.actorId,
      leadId: input.leadId,
      dealId: input.dealId,
    });
  }

  return pendentes.length;
}
