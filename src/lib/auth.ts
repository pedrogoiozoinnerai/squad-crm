import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";

export const SESSION_COOKIE = "squad_crm_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /// Features liberadas pelo papel — quem vê o quê sai de config, não de deploy.
  features: string[];
};

export function allowedDomain() {
  return (process.env.ALLOWED_EMAIL_DOMAIN ?? "innerai.com").toLowerCase();
}

export function isEmailAllowed(email: string) {
  return email.trim().toLowerCase().endsWith(`@${allowedDomain()}`);
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/** Cria a sessão e grava o cookie httpOnly. */
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.authSession.create({ data: { token, userId, expiresAt } });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.authSession.deleteMany({ where: { token } });
  jar.delete(SESSION_COOKIE);
}

/**
 * Fonte única de verdade da sessão. O `proxy.ts` só faz a checagem otimista
 * (existe cookie?); a autorização real acontece sempre aqui, no servidor.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.authSession.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date() || !session.user.active) return null;

  const { id, name, email, role } = session.user;

  const permission = await prisma.rolePermission.findFirst({
    where: { role, active: true },
    select: { features: true },
  });

  return {
    id,
    name,
    email,
    role,
    features: permission?.features.split(",").map((f) => f.trim()).filter(Boolean) ?? [],
  };
}

/** Nenhuma permissão cadastrada = libera tudo, para não travar o sistema. */
export function can(user: SessionUser, feature: string) {
  return user.features.length === 0 || user.features.includes(feature);
}

/** Exige usuário logado e que ele esteja no espaço (/admin ou /user) correto. */
export async function requireUser(space?: "admin" | "user"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const home = homeFor(user.role);
  if (space === "admin" && user.role !== "ADMIN") redirect(home);
  if (space === "user" && user.role === "ADMIN") redirect(home);

  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  return requireUser("admin");
}

export function homeFor(role: Role) {
  return role === "ADMIN" ? "/admin/inicio" : "/user/inicio";
}

/**
 * Escopo de dados: admin enxerga tudo, user só o que é dele.
 * Usado em toda query de lista para evitar vazamento entre vendedores.
 */
export function ownerScope(user: SessionUser) {
  return user.role === "ADMIN" ? {} : { ownerId: user.id };
}
