"use server";

import { revalidatePath } from "next/cache";

import { problemaNaRubrica } from "@/lib/analise";
import { TZ } from "@/lib/dates";
import { dataDoDia, text } from "@/lib/forms";
import {
  assertOwnsContext,
  currentUser,
  logActivity,
  revalidateBoth,
  type FormState,
} from "@/lib/guard";
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

/**
 * Anota alguma coisa sobre a SESSÃO.
 *
 * O que não é de nenhum lead em particular não tinha onde cair: uma coletiva
 * tem vinte inscritos, e "a objeção de preço apareceu três vezes hoje" não é
 * anotação de nenhum deles. O closer guardava isso na cabeça, ou no papel.
 *
 * Escrita é de quem conduziu, ou do admin — diferente da LEITURA da sessão, que
 * é do time inteiro. `assertOwnsContext` é quem confere: Server Action é
 * superfície pública, e o id da reunião vem no corpo do POST.
 */
export async function anotarSessao(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await currentUser();

  const conteudo = String(formData.get("content") ?? "").trim();
  if (conteudo.length < 2) return { error: "Escreva a anotação." };

  const meetingId = text(formData.get("meetingId"));
  if (!meetingId) return { error: "Anotação sem sessão." };

  await assertOwnsContext(user, { meetingId });

  await prisma.note.create({ data: { content: conteudo, authorId: user.id, meetingId } });
  await logActivity({
    kind: "NOTE_ADDED",
    title: "Anotação na sessão",
    detail: conteudo.slice(0, 140),
    authorId: user.id,
    meetingId,
  });

  revalidatePath(`/admin/sessoes/${meetingId}`);
  revalidatePath(`/user/sessoes/${meetingId}`);
  return { ok: true };
}

/**
 * Publica uma versão nova da rubrica de auditoria.
 *
 * **Nunca `UPDATE`.** Editar por cima apagaria a régua pela qual as calls
 * antigas foram julgadas: duas calls com a mesma nota passariam a ter sido
 * medidas por textos diferentes, e nada registraria isso. Cada salvamento é uma
 * versão nova, e a anterior continua pendurada nas análises que ela produziu.
 *
 * O corpo é SÓ a régua de julgamento. O formato da resposta é gerado do Zod em
 * `lib/analise` e anexado pelo código — o operador não o alcança. É o conserto,
 * por construção, do erro do CRM de referência: lá o prompt de 13.605
 * caracteres pede dezenas de campos e o schema de saída aceita cinco, então a
 * maior parte da análise é gerada, paga e descartada em silêncio.
 */
export async function publicarRubrica(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await currentUser();
  if (user.role !== "ADMIN") return { error: "Só administradores mexem na rubrica." };

  const corpo = String(formData.get("corpo") ?? "").trim();
  const problema = problemaNaRubrica(corpo);
  if (problema) return { error: problema.motivo };

  const ultima = await prisma.aiPrompt.findFirst({
    where: { tipo: "AUDITORIA" },
    orderBy: { versao: "desc" },
    select: { versao: true },
  });

  // Desativa e cria numa transação só: entre as duas instruções, uma execução
  // do cron acharia zero rubricas ativas e pularia a semeadura — ou duas, e
  // pegaria a errada pela ordem.
  await prisma.$transaction([
    prisma.aiPrompt.updateMany({ where: { tipo: "AUDITORIA", ativo: true }, data: { ativo: false } }),
    prisma.aiPrompt.create({
      data: {
        tipo: "AUDITORIA",
        versao: (ultima?.versao ?? 0) + 1,
        ativo: true,
        corpo,
        autorId: user.id,
      },
    }),
  ]);

  revalidatePath("/admin/configuracoes");
  return { ok: true };
}

/** Liga ou desliga a auditoria sem apagar a régua. */
export async function alternarRubrica(formData: FormData) {
  const user = await currentUser();
  if (user.role !== "ADMIN") throw new Error("Só administradores mexem na rubrica.");

  const id = text(formData.get("id"));
  if (!id) throw new Error("Rubrica não informada.");

  const rubrica = await prisma.aiPrompt.findUnique({ where: { id }, select: { ativo: true } });
  if (!rubrica) throw new Error("Rubrica não encontrada.");

  await prisma.$transaction([
    prisma.aiPrompt.updateMany({ where: { tipo: "AUDITORIA", ativo: true }, data: { ativo: false } }),
    ...(rubrica.ativo ? [] : [prisma.aiPrompt.update({ where: { id }, data: { ativo: true } })]),
  ]);

  revalidatePath("/admin/configuracoes");
}
