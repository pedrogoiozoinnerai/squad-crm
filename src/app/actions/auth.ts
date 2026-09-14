"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  allowedDomain,
  createSession,
  destroySession,
  hashPassword,
  homeFor,
  isEmailAllowed,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type AuthState = {
  error?: string;
  /** Ecoa o que já foi digitado para o formulário não limpar após um erro. */
  values?: { name?: string; email?: string };
} | null;

const credentials = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
});

const signUpSchema = credentials.extend({
  name: z.string().trim().min(2, "Informe seu nome."),
});

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const typed = { email: String(formData.get("email") ?? "") };

  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, values: typed };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  // Mensagem genérica de propósito: não revela se o e-mail existe.
  const invalid = { error: "E-mail ou senha incorretos.", values: typed };
  if (!user || !user.active) return invalid;

  // Conta criada pela importação do HubSpot: existe, tem negócios atrelados,
  // mas ninguém escolheu senha ainda. Dizer isso não vaza nada que a própria
  // tela de cadastro não revelaria, e sem essa dica a pessoa fica tentando
  // senhas para uma conta que nunca teve nenhuma.
  if (!user.passwordHash) {
    return {
      error: "Esta conta veio da migração e ainda não tem senha. Use \"Criar conta\" com este mesmo e-mail.",
      values: typed,
    };
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return invalid;

  await createSession(user.id);
  redirect(homeFor(user.role));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const typed = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
  };

  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, values: typed };
  }

  const { name, email, password } = parsed.data;

  if (!isEmailAllowed(email)) {
    return { error: `Só e-mails @${allowedDomain()} podem criar conta.`, values: typed };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.passwordHash) {
    return { error: "Já existe uma conta com esse e-mail.", values: typed };
  }

  // Sem nenhuma conta COM SENHA, quem se cadastra vira ADMIN — senão o sistema
  // fica sem administrador. Contas sem senha não contam: a importação do
  // HubSpot cria uma para cada responsável, e contá-las tiraria o primeiro
  // administrador de quem chegasse depois da migração.
  const isFirstUser = (await prisma.user.count({ where: { NOT: { passwordHash: "" } } })) === 0;

  // Conta importada: assumir a existente preserva os negócios, leads e tarefas
  // que já apontam para ela. Criar outra deixaria tudo órfão.
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          name,
          passwordHash: await hashPassword(password),
          active: true,
          ...(isFirstUser ? { role: "ADMIN" as const } : {}),
        },
      })
    : await prisma.user.create({
        data: {
          name,
          email,
          passwordHash: await hashPassword(password),
          role: isFirstUser ? "ADMIN" : "USER",
        },
      });

  await createSession(user.id);
  redirect(homeFor(user.role));
}

export async function signOut() {
  await destroySession();
  redirect("/");
}
