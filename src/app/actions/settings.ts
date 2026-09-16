"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { text } from "@/lib/forms";
import { currentUser, revalidateBoth, type FormState } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

/**
 * Configuração da operação — etapas, motivos de perda e templates de tarefa.
 *
 * Antes destas actions, mudar qualquer um desses itens exigia rodar o seed, que
 * apaga a base inteira: trocar o nome de uma etapa custava todos os negócios.
 * Por isso aqui tudo é incremental e nada destrói dado em uso — item com
 * negócio vinculado se desativa, não se exclui.
 */

// ──────────────────────────── Guardas ────────────────────────────

/**
 * A configuração é global: um clique aqui muda o funil de todo mundo. Server
 * Action é POST público, então o papel é conferido aqui dentro — nunca na tela.
 */
async function requireAdminAction() {
  const user = await currentUser();
  if (user.role !== "ADMIN") {
    throw new Error("Só o administrador altera a configuração da operação.");
  }
  return user;
}

const CONFIG_PATH = "/admin/configuracoes";

/** Etapa aparece no pipeline, na lista de negócios e no funil do Dashboard. */
function revalidarEtapas() {
  revalidatePath(CONFIG_PATH);
  revalidateBoth(revalidatePath, "inicio", "pipeline", "deals");
}

/** Motivo de perda entra no fechamento do negócio e no bloco de perdas. */
function revalidarMotivos() {
  revalidatePath(CONFIG_PATH);
  revalidateBoth(revalidatePath, "inicio", "pipeline", "deals");
}

/** Template alimenta as tarefas criadas na mão e as nascidas de automação. */
function revalidarTemplates() {
  revalidatePath(CONFIG_PATH);
  revalidateBoth(revalidatePath, "tarefas", "pipeline");
}

function plural(n: number, singular: string, plural_: string) {
  return `${n} ${n === 1 ? singular : plural_}`;
}

// ──────────────────────────── Schemas ────────────────────────────

// Arquivo "use server": só pode exportar função async, então estas listas
// ficam locais — as opções equivalentes da tela vivem nos componentes.
const HEX = /^#[0-9a-fA-F]{6}$/;
const STAGE_ROLES = ["SDR", "CLOSER", "CS"] as const;
const TASK_TYPES = ["follow_up", "call_individual", "call", "message"] as const;
const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

const idSchema = z.object({ id: z.string().min(1, "Registro inválido.") });
const moveSchema = idSchema.extend({ dir: z.enum(["up", "down"]) });

const etapaSchema = z.object({
  name: z
    .string()
    .min(2, "Dê um nome de ao menos 2 caracteres à etapa.")
    .max(40, "O nome da etapa deve ter no máximo 40 caracteres."),
  color: z.string().regex(HEX, "Escolha uma cor válida para a etapa."),
  targetRole: z.enum(STAGE_ROLES).nullable(),
});

const motivoSchema = z.object({
  name: z
    .string()
    .min(2, "Dê um nome de ao menos 2 caracteres ao motivo.")
    .max(60, "O nome do motivo deve ter no máximo 60 caracteres."),
});

const templateSchema = z.object({
  name: z
    .string()
    .min(2, "Dê um nome de ao menos 2 caracteres ao template.")
    .max(60, "O nome do template deve ter no máximo 60 caracteres."),
  description: z.string().max(300, "A descrição deve ter no máximo 300 caracteres.").nullable(),
  type: z.enum(TASK_TYPES),
  priority: z.enum(TASK_PRIORITIES),
  messageText: z
    .string()
    .max(2000, "A mensagem pronta deve ter no máximo 2000 caracteres.")
    .nullable(),
  meetingEnabled: z.boolean(),
});

function lerEtapa(formData: FormData) {
  return etapaSchema.safeParse({
    name: text(formData.get("name")) ?? "",
    color: text(formData.get("color")) ?? "",
    targetRole: text(formData.get("targetRole")),
  });
}

function lerTemplate(formData: FormData) {
  return templateSchema.safeParse({
    name: text(formData.get("name")) ?? "",
    description: text(formData.get("description")),
    type: text(formData.get("type")) ?? "follow_up",
    priority: text(formData.get("priority")) ?? "MEDIUM",
    messageText: text(formData.get("messageText")),
    meetingEnabled: formData.get("meetingEnabled") !== null,
  });
}

/** Primeira mensagem do zod já é a que interessa ao usuário. */
function primeiroErro(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Confira os campos do formulário.";
}

/**
 * `key` é única e identifica a etapa no código (automações, import do funil),
 * então nasce do nome uma vez e não muda mais quando a etapa é renomeada.
 */
async function chaveUnica(name: string) {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24) || "etapa";

  for (let i = 1; i <= 50; i++) {
    const key = i === 1 ? base : `${base}_${i}`;
    const existe = await prisma.stage.findUnique({ where: { key }, select: { id: true } });
    if (!existe) return key;
  }
  throw new Error("Não foi possível gerar uma chave única para a etapa.");
}

// ───────────────────────── Etapas do pipeline ─────────────────────────

/** Etapa nova entra no fim do funil; a posição se ajusta na seta ↑↓. */
export async function criarEtapa(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdminAction();

  const parsed = lerEtapa(formData);
  if (!parsed.success) return { error: primeiroErro(parsed.error) };
  const { name, color, targetRole } = parsed.data;

  const ultima = await prisma.stage.findFirst({
    orderBy: { order: "desc" },
    select: { order: true },
  });

  await prisma.stage.create({
    data: {
      key: await chaveUnica(name),
      name,
      color,
      targetRole,
      order: (ultima?.order ?? 0) + 1,
    },
  });

  revalidarEtapas();
  return { ok: true };
}

export async function salvarEtapa(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdminAction();

  const id = text(formData.get("id"));
  if (!id) return { error: "Etapa inválida." };

  const parsed = lerEtapa(formData);
  if (!parsed.success) return { error: primeiroErro(parsed.error) };

  const etapa = await prisma.stage.findUnique({ where: { id }, select: { id: true } });
  if (!etapa) return { error: "Etapa não encontrada." };

  await prisma.stage.update({ where: { id }, data: parsed.data });

  revalidarEtapas();
  return { ok: true };
}

/**
 * Sobe ou desce a etapa reescrevendo a sequência inteira (1..n).
 *
 * Trocar só os dois valores de `order` parece mais barato, mas `order` não é
 * única no schema: um empate herdado do seed travaria a etapa para sempre.
 */
export async function moverEtapa(formData: FormData) {
  await requireAdminAction();
  const { id, dir } = moveSchema.parse({ id: formData.get("id"), dir: formData.get("dir") });

  const etapas = await prisma.stage.findMany({ orderBy: { order: "asc" }, select: { id: true } });
  const de = etapas.findIndex((e) => e.id === id);
  const para = dir === "up" ? de - 1 : de + 1;
  if (de < 0 || para < 0 || para >= etapas.length) return;

  const ordenadas = [...etapas];
  [ordenadas[de], ordenadas[para]] = [ordenadas[para], ordenadas[de]];

  await prisma.$transaction(
    ordenadas.map((e, i) => prisma.stage.update({ where: { id: e.id }, data: { order: i + 1 } })),
  );

  revalidarEtapas();
}

/**
 * Remove a etapa — só quando está vazia.
 *
 * Etapa não tem "inativa" no schema: os negócios apontam para ela por FK, então
 * apagar uma etapa com negócio derrubaria os negócios junto. A tela bloqueia o
 * botão; esta checagem é a que vale.
 */
export async function excluirEtapa(formData: FormData) {
  await requireAdminAction();
  const { id } = idSchema.parse({ id: formData.get("id") });

  const etapa = await prisma.stage.findUnique({
    where: { id },
    include: { _count: { select: { deals: true } } },
  });
  if (!etapa) throw new Error("Etapa não encontrada.");

  if (etapa._count.deals > 0) {
    throw new Error(
      `"${etapa.name}" tem ${plural(etapa._count.deals, "negócio", "negócios")}. ` +
        "Mova esses negócios para outra etapa antes de remover.",
    );
  }

  const total = await prisma.stage.count();
  if (total <= 1) throw new Error("O pipeline precisa de ao menos uma etapa.");

  await prisma.stage.delete({ where: { id } });

  // Fecha o buraco deixado na sequência para o próximo ↑↓ continuar previsível.
  const restantes = await prisma.stage.findMany({ orderBy: { order: "asc" }, select: { id: true } });
  await prisma.$transaction(
    restantes.map((e, i) => prisma.stage.update({ where: { id: e.id }, data: { order: i + 1 } })),
  );

  revalidarEtapas();
}

// ───────────────────────── Motivos de perda ─────────────────────────

export async function criarMotivo(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdminAction();

  const parsed = motivoSchema.safeParse({ name: text(formData.get("name")) ?? "" });
  if (!parsed.success) return { error: primeiroErro(parsed.error) };
  const { name } = parsed.data;

  const existe = await prisma.lossReason.findUnique({ where: { name }, select: { id: true } });
  if (existe) return { error: `Já existe um motivo chamado "${name}".` };

  const ultimo = await prisma.lossReason.findFirst({
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  });

  await prisma.lossReason.create({
    data: { name, orderIndex: (ultimo?.orderIndex ?? 0) + 1 },
  });

  revalidarMotivos();
  return { ok: true };
}

export async function salvarMotivo(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdminAction();

  const id = text(formData.get("id"));
  if (!id) return { error: "Motivo inválido." };

  const parsed = motivoSchema.safeParse({ name: text(formData.get("name")) ?? "" });
  if (!parsed.success) return { error: primeiroErro(parsed.error) };
  const { name } = parsed.data;

  const motivo = await prisma.lossReason.findUnique({ where: { id }, select: { id: true } });
  if (!motivo) return { error: "Motivo não encontrado." };

  const homonimo = await prisma.lossReason.findUnique({ where: { name }, select: { id: true } });
  if (homonimo && homonimo.id !== id) return { error: `Já existe um motivo chamado "${name}".` };

  await prisma.lossReason.update({ where: { id }, data: { name } });

  revalidarMotivos();
  return { ok: true };
}

export async function moverMotivo(formData: FormData) {
  await requireAdminAction();
  const { id, dir } = moveSchema.parse({ id: formData.get("id"), dir: formData.get("dir") });

  const motivos = await prisma.lossReason.findMany({
    orderBy: { orderIndex: "asc" },
    select: { id: true },
  });
  const de = motivos.findIndex((m) => m.id === id);
  const para = dir === "up" ? de - 1 : de + 1;
  if (de < 0 || para < 0 || para >= motivos.length) return;

  const ordenados = [...motivos];
  [ordenados[de], ordenados[para]] = [ordenados[para], ordenados[de]];

  await prisma.$transaction(
    ordenados.map((m, i) =>
      prisma.lossReason.update({ where: { id: m.id }, data: { orderIndex: i + 1 } }),
    ),
  );

  revalidarMotivos();
}

/**
 * Desativar é o "excluir" seguro: o motivo some da lista de fechamento mas os
 * negócios já perdidos continuam explicados no Dashboard.
 */
export async function alternarMotivo(formData: FormData) {
  await requireAdminAction();
  const { id } = idSchema.parse({ id: formData.get("id") });

  const motivo = await prisma.lossReason.findUnique({
    where: { id },
    select: { active: true },
  });
  if (!motivo) throw new Error("Motivo não encontrado.");

  await prisma.lossReason.update({ where: { id }, data: { active: !motivo.active } });

  revalidarMotivos();
}

export async function excluirMotivo(formData: FormData) {
  await requireAdminAction();
  const { id } = idSchema.parse({ id: formData.get("id") });

  const motivo = await prisma.lossReason.findUnique({
    where: { id },
    include: { _count: { select: { deals: true } } },
  });
  if (!motivo) throw new Error("Motivo não encontrado.");

  if (motivo._count.deals > 0) {
    throw new Error(
      `"${motivo.name}" explica ${plural(motivo._count.deals, "negócio perdido", "negócios perdidos")}. ` +
        "Desative o motivo em vez de excluir, para não apagar a análise de perda.",
    );
  }

  await prisma.lossReason.delete({ where: { id } });

  revalidarMotivos();
}

// ──────────────────────── Templates de tarefa ────────────────────────

export async function criarTemplate(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdminAction();

  const parsed = lerTemplate(formData);
  if (!parsed.success) return { error: primeiroErro(parsed.error) };

  await prisma.taskTemplate.create({ data: parsed.data });

  revalidarTemplates();
  return { ok: true };
}

export async function salvarTemplate(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdminAction();

  const id = text(formData.get("id"));
  if (!id) return { error: "Template inválido." };

  const parsed = lerTemplate(formData);
  if (!parsed.success) return { error: primeiroErro(parsed.error) };

  const template = await prisma.taskTemplate.findUnique({ where: { id }, select: { id: true } });
  if (!template) return { error: "Template não encontrado." };

  // As tarefas já criadas não mudam: elas copiaram o texto no momento da criação.
  await prisma.taskTemplate.update({ where: { id }, data: parsed.data });

  revalidarTemplates();
  return { ok: true };
}

/** Template inativo para de alimentar as automações na hora. */
export async function alternarTemplate(formData: FormData) {
  await requireAdminAction();
  const { id } = idSchema.parse({ id: formData.get("id") });

  const template = await prisma.taskTemplate.findUnique({
    where: { id },
    select: { active: true },
  });
  if (!template) throw new Error("Template não encontrado.");

  await prisma.taskTemplate.update({ where: { id }, data: { active: !template.active } });

  revalidarTemplates();
}

// ── A régua de presença ──────────────────────────────────────────────────────

/**
 * Salva quando um participante "esteve" na reunião.
 *
 * Esta tela faltava desde sempre. `SessionsView` diz, em comentário e na
 * própria página, que a regra "vem do banco, não de uma constante aqui: ela é
 * editável no painel" — e o painel não existia. `Config` era lido por três
 * telas e escrito por ninguém, então a régua ficava presa no `@default` do
 * schema e mudá-la exigia migração.
 *
 * Não reescreve o passado: `MeetingAttendee.regraMinutos` guarda a régua que
 * produziu cada veredicto. A próxima reconciliação aplica a nova aos que ela
 * recalcular, e os números antigos continuam dizendo de qual régua vieram.
 */
export async function salvarRegraDePresenca(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdminAction();

  const minutos = Number(formData.get("presencaMinutos"));
  if (!Number.isInteger(minutos) || minutos < 0 || minutos > 240) {
    return { error: "Os minutos mínimos precisam ser um número entre 0 e 240." };
  }

  const percentual = Number(formData.get("presencaPercentual"));
  if (!Number.isInteger(percentual) || percentual < 0 || percentual > 100) {
    return { error: "O percentual precisa ser um número entre 0 e 100." };
  }

  await prisma.config.upsert({
    where: { id: "unica" },
    update: { presencaMinutos: minutos, presencaPercentual: percentual },
    create: { presencaMinutos: minutos, presencaPercentual: percentual },
  });

  revalidatePath(CONFIG_PATH);
  revalidateBoth(revalidatePath, "sessoes", "participantes");
  return { ok: true };
}
