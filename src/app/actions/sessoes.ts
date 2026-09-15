"use server";

import { revalidatePath } from "next/cache";

import { TZ } from "@/lib/dates";
import { dataDoDia, text } from "@/lib/forms";
import { currentUser, revalidateBoth, type FormState } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { materializarSessoes } from "@/lib/sessoes";
import { diasDaSemana, horariosDaSerie } from "@/lib/slots";

const DURACOES = [30, 45, 60, 90, 120];

/**
 * Cria ou edita uma série recorrente.
 *
 * Materializa na hora, não só no cron: quem acabou de criar "toda terça às 10h"
 * espera ver a grade preenchida, não descobrir amanhã se funcionou.
 */
export async function salvarSerie(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await currentUser();
  if (user.role !== "ADMIN") return { error: "Só administradores mexem nas séries." };

  const nome = text(formData.get("name"));
  if (!nome) return { error: "Dê um nome à série." };

  const dias = diasDaSemana(String(formData.get("weekdays") ?? ""));
  if (dias.length === 0) return { error: "Escolha ao menos um dia da semana." };

  // `getAll` porque a tela manda um campo por horário marcado; o CSV continua
  // aceito para quem editar à mão ou por script.
  const horarios = horariosDaSerie(
    formData.getAll("times").map(String).join(","),
  );
  if (horarios.length === 0) {
    return { error: "Escolha ao menos um horário." };
  }

  const duracao = Number(formData.get("durationMin"));
  if (!DURACOES.includes(duracao)) return { error: "Duração inválida." };

  const capacidade = Number(formData.get("capacity"));
  if (!Number.isInteger(capacidade) || capacidade < 1 || capacidade > 500) {
    return { error: "A lotação precisa ser um número entre 1 e 500." };
  }

  const ownerId = text(formData.get("ownerId"));
  if (!ownerId) return { error: "Escolha quem conduz a sessão." };
  const dono = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
  if (!dono) return { error: "Responsável não encontrado." };

  // Colunas que existiam no schema, eram respeitadas por `slotsDaSerie` e
  // NUNCA eram escritas por aqui — então nenhuma delas era alcançável pela
  // interface e todas ficavam no padrão para sempre.
  const horizonte = formData.get("horizonte") === "DIAS" ? ("DIAS" as const) : ("FIM_DO_MES" as const);

  const horizonDias = Number(formData.get("horizonDias") ?? 28);
  if (horizonte === "DIAS" && (!Number.isInteger(horizonDias) || horizonDias < 1 || horizonDias > 90)) {
    return { error: "O horizonte em dias precisa ser um número entre 1 e 90." };
  }

  const fuso = text(formData.get("timezone")) ?? TZ;
  if (!Intl.supportedValuesOf("timeZone").includes(fuso)) {
    return { error: "Fuso horário desconhecido." };
  }

  const inicioEm = dataDoDia(formData.get("startsOn"));
  const fimEm = dataDoDia(formData.get("endsOn"));
  if (inicioEm && fimEm && fimEm < inicioEm) {
    return { error: "A série não pode terminar antes de começar." };
  }

  const id = text(formData.get("id"));
  const dados = {
    name: nome,
    weekdays: dias.join(","),
    times: horarios.join(","),
    durationMin: duracao,
    capacity: capacidade,
    timezone: fuso,
    horizonte,
    horizonDias,
    startsOn: inicioEm,
    endsOn: fimEm,
    ownerId,
  };

  const serie = id
    ? await prisma.sessionTemplate.update({ where: { id }, data: dados })
    : await prisma.sessionTemplate.create({ data: dados });

  await materializarSessoes(new Date(), { templateId: serie.id });

  revalidateBoth(revalidatePath, "sessoes", "calendar");
  revalidatePath("/admin/configuracoes");
  return { ok: true };
}

/**
 * Desliga uma série.
 *
 * Não apaga o que já foi materializado: as sessões futuras continuam na agenda
 * de quem já se inscreveu. Desligar a série é parar de criar novas, não
 * cancelar as marcadas — cancelar é decisão por sessão.
 */
export async function desativarSerie(formData: FormData) {
  const user = await currentUser();
  if (user.role !== "ADMIN") throw new Error("Só administradores mexem nas séries.");

  const id = text(formData.get("id"));
  if (!id) throw new Error("Série não informada.");

  const serie = await prisma.sessionTemplate.findUnique({ where: { id }, select: { active: true } });
  if (!serie) throw new Error("Série não encontrada.");

  await prisma.sessionTemplate.update({ where: { id }, data: { active: !serie.active } });
  revalidatePath("/admin/configuracoes");
  revalidateBoth(revalidatePath, "sessoes");
}
