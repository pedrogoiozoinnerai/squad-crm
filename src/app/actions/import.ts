"use server";

import { revalidatePath } from "next/cache";

import { currentUser, logActivity, revalidateBoth, type FormState } from "@/lib/guard";
import { nextDealCode } from "@/lib/codes";
import { prisma } from "@/lib/prisma";
import { readFunnelLeads } from "@/lib/type-funnel";

export type ImportState =
  | (FormState & { created?: number; skipped?: number; meetings?: number; deals?: number })
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

  // O Dashboard mede receita e pipeline por Deal — lead sem negócio é invisível
  // na tela de Receita. Então todo lead importado nasce com negócio na 1ª etapa.
  const primeiraEtapa = await prisma.stage.findFirst({ orderBy: { order: "asc" } });
  if (!primeiraEtapa) return { error: "Nenhuma etapa de pipeline configurada." };

  let created = 0;
  let meetings = 0;
  let deals = 0;

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

    // Negócio na primeira etapa, sem valor — quem qualificar preenche.
    const deal = await prisma.deal.create({
      data: {
        code: await nextDealCode(),
        leadId: lead.id,
        stageId: primeiraEtapa.id,
        valueCents: 0,
        probability: 20,
        ownerId: user.id,
      },
    });
    deals += 1;

    await logActivity({
      kind: "DEAL_CREATED",
      title: `Negócio criado em ${primeiraEtapa.name}`,
      detail: "Aberto automaticamente pelo import do funil",
      authorId: user.id,
      leadId: lead.id,
      dealId: deal.id,
    });

    // O funil já agendou a reunião — traz junto, sem reagendar nada.
    if (hasSchedule) {
      await prisma.meeting.create({
        data: {
          title: `Diagnóstico · ${lead.name}`,
          startsAt: scheduledAt,
          endsAt: new Date(scheduledAt.getTime() + 30 * 60_000),
          type: "ONE_ON_ONE",
          // O responsável é quem importou; o lead ainda não tem dono.
          ownerId: user.id,
          leadId: lead.id,
        },
      });
      meetings += 1;
    }

    created += 1;
  }

  revalidateBoth(revalidatePath, "leads", "calendar", "agenda", "pipeline", "deals", "inicio");
  return { ok: true, created, skipped: rows.length - created, meetings, deals };
}
