"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { allowedDomain, getSessionUser, isEmailAllowed } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  userId: z.string().min(1),
  role: z.enum(["ADMIN", "USER"]).optional(),
});

async function requireAdminAction() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") throw new Error("Sem permissão.");
  return user;
}

export async function setUserRole(formData: FormData) {
  const admin = await requireAdminAction();
  const { userId, role } = schema.parse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!role) return;

  // Trava de segurança: não deixa o sistema ficar sem nenhum admin.
  if (userId === admin.id && role === "USER") {
    const admins = await prisma.user.count({ where: { role: "ADMIN", active: true } });
    if (admins <= 1) throw new Error("O sistema precisa de ao menos um administrador.");
  }

  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin/usuarios");
}

export async function toggleUserActive(formData: FormData) {
  const admin = await requireAdminAction();
  const { userId } = schema.parse({ userId: formData.get("userId") });

  if (userId === admin.id) throw new Error("Você não pode desativar a própria conta.");

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("Usuário não encontrado.");

  await prisma.user.update({ where: { id: userId }, data: { active: !target.active } });
  // Desativou? Derruba as sessões abertas na hora.
  if (target.active) await prisma.authSession.deleteMany({ where: { userId } });

  revalidatePath("/admin/usuarios");
}

/**
 * Libera um e-mail para criar conta.
 *
 * O botão existe porque a alternativa — domínio liberado para todo mundo — deixa
 * qualquer pessoa com e-mail @innerai.com assumir a conta importada de um
 * vendedor e ver a carteira dele. Liberar é ato consciente de um admin.
 */
export async function liberarCadastro(formData: FormData) {
  const admin = await requireAdminAction();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!isEmailAllowed(email)) {
    throw new Error(`Só e-mails @${allowedDomain()} podem ser liberados.`);
  }

  const existente = await prisma.user.findUnique({ where: { email } });
  if (existente?.passwordHash) {
    throw new Error("Essa conta já existe e já tem senha.");
  }

  await prisma.invite.upsert({
    where: { email },
    update: { usedAt: null, createdById: admin.id },
    create: { email, createdById: admin.id },
  });

  revalidatePath("/admin/usuarios");
}

/** Revoga a liberação de quem ainda não se cadastrou. */
export async function revogarCadastro(formData: FormData) {
  await requireAdminAction();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  await prisma.invite.deleteMany({ where: { email, usedAt: null } });
  revalidatePath("/admin/usuarios");
}
