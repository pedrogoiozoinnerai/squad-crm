import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { env } from "@/lib/env";
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
  return env("ALLOWED_EMAIL_DOMAIN", "innerai.com")!.toLowerCase();
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

/**
 * O banco guarda o hash; o token em claro só existe no cookie.
 *
 * SHA-256 sem sal de propósito: o token tem 256 bits de entropia, então não há
 * o que adivinhar por dicionário, e a busca precisa ser por igualdade direta —
 * um bcrypt aqui exigiria varrer a tabela a cada requisição.
 */
function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Cria a sessão e grava o cookie httpOnly. */
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.authSession.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });

  // Faxina oportunista. Login é evento raro e as duas consultas usam índice, e
  // assim não depende de cron nem de worker — que este projeto não tem, e que
  // seriam mais uma coisa para lembrar de configurar em produção.
  const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await Promise.all([
    prisma.authSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: ontem } } }),
  ]);

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
  if (token) await prisma.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
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
    where: { tokenHash: hashToken(token) },
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

/**
 * Conta que ainda é só um registro importado, sem ninguém por trás.
 *
 * A migração do HubSpot cria uma conta para cada responsável, para que negócio
 * e lead já nasçam atribuídos a quem sempre cuidou deles. Elas não podem
 * entrar, e não contam para a regra do primeiro administrador.
 */
export function contaNaoAssumida(user: { claimedAt: Date | null }) {
  return user.claimedAt === null;
}

/**
 * Trava de força bruta por e-mail.
 *
 * Seis erros em quinze minutos e o e-mail descansa. Contar no banco, e não em
 * memória, porque cada requisição serverless pode cair num processo diferente:
 * um contador em memória protegeria só a instância que por acaso atendeu.
 */
const TENTATIVAS_MAX = 6;
const JANELA_MIN = 15;

export async function excedeuTentativas(email: string) {
  const desde = new Date(Date.now() - JANELA_MIN * 60 * 1000);
  const falhas = await prisma.loginAttempt.count({
    where: { email, sucesso: false, createdAt: { gte: desde } },
  });
  return falhas >= TENTATIVAS_MAX;
}

export async function registrarTentativa(email: string, sucesso: boolean, ip?: string) {
  await prisma.loginAttempt.create({ data: { email, sucesso, ip } });
  // Acerto limpa o histórico: quem entrou provou que é dono da conta, e deixar
  // as falhas antigas ali travaria o próximo erro de digitação legítimo.
  if (sucesso) {
    await prisma.loginAttempt.deleteMany({ where: { email, sucesso: false } });
  }
}

/** Comparação de string sem vazar tempo — usada no `state` do OAuth. */
export function igualSemVazarTempo(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
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
