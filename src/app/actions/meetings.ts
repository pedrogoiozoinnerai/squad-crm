"use server";

import { revalidatePath } from "next/cache";

import { hhmm } from "@/lib/dates";
import { dataHora, text } from "@/lib/forms";
import {
  assertOwns,
  assertOwnsContext,
  currentUser,
  logActivity,
  revalidateBoth,
  type FormState,
} from "@/lib/guard";
import { garantirConvite } from "@/lib/convites";
import { prisma } from "@/lib/prisma";
import { duracaoValida, fimDaReuniao, lotacaoValida, tipoDeReuniao } from "@/lib/reuniao";

/**
 * Estado da ação de agendar.
 *
 * Tem um `aviso` além do `error`: sobreposição de horário **não impede** a
 * reunião de existir. Quem pediu para marcar a qualquer hora não pode ser
 * barrado por uma regra que o sistema inventou — mas merece saber que já tem
 * outra coisa naquele horário.
 */
export type EstadoDaReuniao = {
  error?: string;
  ok?: boolean;
  aviso?: string;
} | null;

export async function scheduleMeeting(
  _prev: EstadoDaReuniao,
  formData: FormData,
): Promise<EstadoDaReuniao> {
  const user = await currentUser();

  const startsAt = dataHora(formData.get("startsAt"));
  if (!startsAt) return { error: "Escolha data e horário." };

  const duracao = duracaoValida(formData.get("duration"));
  if (duracao === null) {
    return { error: "Duração inválida. Use de 5 a 480 minutos, de 5 em 5." };
  }

  const tipo = tipoDeReuniao(formData.get("type"));

  const lotacao = lotacaoValida(formData.get("capacity"), tipo);
  if (lotacao === "invalida") {
    return { error: "A lotação precisa ser um número entre 1 e 500." };
  }

  const leadId = text(formData.get("leadId"));
  const dealId = text(formData.get("dealId"));

  // Valida os DOIS ids de uma vez e devolve o dono resolvido. Conferir só um
  // deixaria passar um negócio de outra pessoa amarrado a um lead que é meu.
  const ctx = await assertOwnsContext(user, { leadId, dealId });

  // Dono explícito: um admin marca no nome de outro closer. O vendedor comum
  // cai no próprio id porque `assertOwns` recusa qualquer outro.
  const ownerPedido = text(formData.get("ownerId"));
  const ownerId = ownerPedido ?? ctx.ownerId;
  assertOwns(user, ownerId);

  const dono = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, name: true, active: true },
  });
  if (!dono?.active) return { error: "Responsável não encontrado ou inativo." };

  let title = String(formData.get("title") ?? "").trim();
  if (!title && ctx.leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: ctx.leadId },
      select: { name: true },
    });
    if (lead) title = `Reunião · ${lead.name}`;
  }
  if (!title) return { error: "Dê um título à reunião." };

  const endsAt = fimDaReuniao(startsAt, duracao);

  // O negócio do lead, quando há um só em aberto. É o que permite a presença
  // medida na sala chegar ao `Deal.attendance` sem ninguém adivinhar qual
  // negócio a reunião decide — com dois em aberto, adivinhar seria pior que
  // não preencher.
  let negocioId = ctx.dealId;
  if (!negocioId && ctx.leadId) {
    const abertos = await prisma.deal.findMany({
      where: { leadId: ctx.leadId, status: "OPEN" },
      select: { id: true },
      take: 2,
    });
    if (abertos.length === 1) negocioId = abertos[0].id;
  }

  const reuniao = await prisma.meeting.create({
    data: {
      title,
      startsAt,
      endsAt,
      type: tipo,
      // Em grupo isto NUNCA é nulo: com lotação nula a sessão some da API de
      // disponibilidade, que filtra `capacity: { not: null }` — e some sem
      // erro nenhum, o que é pior.
      capacity: lotacao,
      ownerId,
      leadId: ctx.leadId,
      dealId: negocioId,
      location: text(formData.get("location")),
    },
  });

  // O convite nasce com a reunião: gerar só quando alguém clica em "copiar"
  // significa que o link não existe até alguém lembrar dele.
  if (ctx.leadId) await garantirConvite(reuniao.id, ctx.leadId);

  await logActivity({
    kind: "MEETING_SCHEDULED",
    title: `Reunião agendada para ${startsAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}`,
    authorId: user.id,
    leadId: ctx.leadId,
    dealId: negocioId,
  });

  revalidateBoth(revalidatePath, "calendar", "agenda", "leads", "sessoes", "pipeline", "deals");

  return { ok: true, aviso: await avisoDeConflito(ownerId, reuniao.id, startsAt, endsAt, dono.name, user.id) };
}

/**
 * "Você já tem X às 14:00" — aviso, nunca bloqueio.
 *
 * Uma constraint de exclusão no banco resolveria de forma mais elegante e
 * estaria ERRADA aqui por dois motivos. Primeiro, contraria o pedido de marcar
 * a qualquer hora: sobreposição é decisão de quem vende (um acompanhamento,
 * uma passagem de bastão), não corrupção de dado. Segundo, quebraria a agenda
 * do funil: a série aceita duração de 90 e 120 minutos com horários de hora em
 * hora, então as sessões se sobrepõem **por construção**, e o `createMany` do
 * materializador falharia derrubando o mês inteiro.
 */
async function avisoDeConflito(
  ownerId: string,
  exceto: string,
  inicio: Date,
  fim: Date,
  nomeDoDono: string,
  quemMarcou: string,
) {
  const choque = await prisma.meeting.findFirst({
    where: {
      ownerId,
      id: { not: exceto },
      status: "SCHEDULED",
      // Sobreposição em SQL: começa antes de a outra acabar e acaba depois de
      // a outra começar. Extremos que se tocam não entram.
      startsAt: { lt: fim },
      endsAt: { gt: inicio },
    },
    select: { title: true, startsAt: true, endsAt: true },
    orderBy: { startsAt: "asc" },
  });
  if (!choque) return undefined;

  const dequem = ownerId === quemMarcou ? "Você" : nomeDoDono;
  return `${dequem} já tem "${choque.title}" das ${hhmm(choque.startsAt)} às ${hhmm(choque.endsAt)}.`;
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

  revalidateBoth(revalidatePath, "calendar", "agenda", "sessoes");
}

/**
 * Busca de leads para o seletor do formulário.
 *
 * `ownerScope` não é detalhe: isto é uma Server Action, alcançável por POST
 * cru, e sem o escopo viraria um endereço para enumerar a base inteira de
 * leads — nome, empresa e e-mail — a partir de qualquer conta.
 */
export async function buscarLeads(termo: string) {
  const user = await currentUser();
  const q = termo.trim();
  if (q.length < 2) return [];

  const { ownerScope } = await import("@/lib/auth");

  const leads = await prisma.lead.findMany({
    where: {
      ...ownerScope(user),
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { company: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, company: true },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });

  return leads;
}
