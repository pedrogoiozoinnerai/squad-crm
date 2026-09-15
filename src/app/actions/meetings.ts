"use server";

import { revalidatePath } from "next/cache";

import { dataHora, text } from "@/lib/forms";
import { assertOwns, currentUser, logActivity, revalidateBoth, type FormState } from "@/lib/guard";
import { garantirConvite } from "@/lib/convites";
import { prisma } from "@/lib/prisma";

const DURATIONS = [30, 45, 60, 90];

export async function scheduleMeeting(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await currentUser();

  const startsAt = dataHora(formData.get("startsAt"));
  if (!startsAt) return { error: "Escolha data e horário." };

  const minutes = Number(formData.get("duration"));
  const duration = DURATIONS.includes(minutes) ? minutes : 30;

  const leadId = text(formData.get("leadId"));
  let ownerId = user.id;
  let title = String(formData.get("title") ?? "").trim();

  if (leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { name: true, ownerId: true },
    });
    if (!lead) return { error: "Lead não encontrado." };
    assertOwns(user, lead.ownerId);
    ownerId = lead.ownerId ?? user.id;
    if (!title) title = `Reunião · ${lead.name}`;
  }

  if (!title) return { error: "Dê um título à reunião." };

  // O negócio aberto do lead, quando há um só. É o que permite a presença
  // medida na sala chegar ao `Deal.attendance` sem ninguém adivinhar qual
  // negócio a reunião decide — com dois em aberto, adivinhar seria pior que
  // não preencher.
  const abertos = leadId
    ? await prisma.deal.findMany({ where: { leadId, status: "OPEN" }, select: { id: true } })
    : [];

  const reuniao = await prisma.meeting.create({
    data: {
      title,
      startsAt,
      endsAt: new Date(startsAt.getTime() + duration * 60_000),
      type: formData.get("type") === "GROUP" ? "GROUP" : "ONE_ON_ONE",
      ownerId,
      leadId,
      dealId: abertos.length === 1 ? abertos[0].id : null,
    },
  });

  // O convite nasce com a reunião: gerar só quando alguém clica em "copiar"
  // significa que o link não existe até alguém lembrar dele.
  if (leadId) await garantirConvite(reuniao.id, leadId);

  await logActivity({
    kind: "MEETING_SCHEDULED",
    title: `Reunião agendada para ${startsAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`,
    authorId: user.id,
    leadId,
  });

  revalidateBoth(revalidatePath, "calendar", "agenda", "leads");
  return { ok: true };
}

export async function setMeetingStatus(formData: FormData) {
  const user = await currentUser();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));

  if (!["SCHEDULED", "DONE", "NO_SHOW", "CANCELED"].includes(status)) {
    throw new Error("Status inválido.");
  }

  const meeting = await prisma.meeting.findUnique({ where: { id }, select: { ownerId: true } });
  if (!meeting) throw new Error("Reunião não encontrada.");
  assertOwns(user, meeting.ownerId);

  await prisma.meeting.update({
    where: { id },
    data: { status: status as "SCHEDULED" | "DONE" | "NO_SHOW" | "CANCELED" },
  });

  revalidateBoth(revalidatePath, "calendar", "agenda");
}
