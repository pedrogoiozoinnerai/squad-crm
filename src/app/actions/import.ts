"use server";

import { revalidatePath } from "next/cache";

import { currentUser, logActivity, revalidateBoth, type FormState } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { readFunnelLeads } from "@/lib/type-funnel";

export type ImportState =
  | (FormState & { created?: number; skipped?: number; meetings?: number })
  | null;

/**
 * Traz para o CRM os leads que concluíram o Funil do Type.
 * Idempotente: `typeLeadId` é único, então reprocessar não duplica nada.
 */
export async function importFunnelLeads(): Promise<ImportState> {
  const user = await currentUser();
  if (user.role !== "ADMIN") return { error: "Só administradores podem importar." };

  let rows;
  try {
    rows = await readFunnelLeads();
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `Não foi possível ler o funil: ${error.message}`
          : "Não foi possível ler o funil.",
    };
  }

  const existing = await prisma.lead.findMany({
    where: { typeLeadId: { in: rows.map((row) => row.id) } },
    select: { typeLeadId: true },
  });
  const known = new Set(existing.map((lead) => lead.typeLeadId));

  let created = 0;
  let meetings = 0;

  for (const row of rows) {
    if (known.has(row.id)) continue;

    const scheduledAt = row.scheduledAt ? new Date(row.scheduledAt) : null;
    const hasSchedule = scheduledAt !== null && !Number.isNaN(scheduledAt.getTime());

    const lead = await prisma.lead.create({
      data: {
        name: row.fullName ?? "Sem nome",
        email: row.email,
        phone: row.phoneE164,
        company: row.company,
        jobTitle: row.role,
        segment: row.segment,
        revenueRange: row.revenueRange,
        // Já vem qualificado do funil quando tem contato e empresa.
        status: (row.phoneE164 || row.email) && row.company ? "COMPLETE" : "INCOMPLETE",
        source: "funil_type",
        utmSource: row.utmSource,
        utmMedium: row.utmMedium,
        utmCampaign: row.utmCampaign,
        typeLeadId: row.id,
        typeSessionId: row.sessionId,
        // Sem responsável: entra na fila para o admin distribuir.
        ownerId: null,
      },
    });

    await logActivity({
      kind: "IMPORTED",
      title: "Importado do Funil do Type",
      detail: row.utmSource ? `Origem: ${row.utmSource}` : null,
      authorId: user.id,
      leadId: lead.id,
    });

    // O funil já agendou a reunião — traz junto, sem reagendar nada.
    if (hasSchedule) {
      await prisma.meeting.create({
        data: {
          title: `Diagnóstico · ${lead.name}`,
          startsAt: scheduledAt,
          endsAt: new Date(scheduledAt.getTime() + 30 * 60_000),
          type: "ONE_ON_ONE",
          ownerId: user.id,
          leadId: lead.id,
        },
      });
      meetings += 1;
    }

    created += 1;
  }

  revalidateBoth(revalidatePath, "leads", "calendar", "agenda");
  return { ok: true, created, skipped: rows.length - created, meetings };
}
