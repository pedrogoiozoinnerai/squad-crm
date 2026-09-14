"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSessionUser } from "@/lib/auth";
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
