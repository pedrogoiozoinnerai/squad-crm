"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { headers } from "next/headers";

import {
  allowedDomain,
  contaNaoAssumida,
  createSession,
  destroySession,
  excedeuTentativas,
  hashPassword,
  homeFor,
  isEmailAllowed,
  registrarTentativa,
  verifyPassword,
} from "@/lib/auth";
import { env } from "@/lib/env";
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

  const { email, password } = parsed.data;

  // A trava vem antes de qualquer consulta ao usuário: quem está sendo forçado
  // não deve nem custar uma busca por e-mail, e a resposta não pode variar
  // conforme a conta exista ou não.
  if (await excedeuTentativas(email)) {
    return {
      error: "Muitas tentativas. Espere quinze minutos ou entre com o Google.",
      values: typed,
    };
  }

  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const user = await prisma.user.findUnique({ where: { email } });

  // Mensagem genérica de propósito: não revela se o e-mail existe.
  const invalid = { error: "E-mail ou senha incorretos.", values: typed };
  if (!user || !user.active) {
    await registrarTentativa(email, false, ip);
    return invalid;
  }

  // Conta que ainda é só um registro importado, ou que entra por SSO: não há
  // senha para conferir. Dizer isso não vaza nada que a tela de cadastro já não
  // revele, e sem a dica a pessoa fica tentando senhas que nunca existiram.
  if (!user.passwordHash) {
    return {
      error: contaNaoAssumida(user)
        ? 'Esta conta veio da migração e ainda não tem senha. Use "Criar conta" com este mesmo e-mail.'
        : "Esta conta entra pelo Google. Use o botão acima.",
      values: typed,
    };
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await registrarTentativa(email, false, ip);
    return invalid;
  }

  await registrarTentativa(email, true, ip);
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
  if (existing && !contaNaoAssumida(existing)) {
    return { error: "Já existe uma conta com esse e-mail.", values: typed };
  }

  // Sem nenhuma conta COM SENHA, quem se cadastra vira ADMIN — senão o sistema
  // fica sem administrador. Contas sem senha não contam: a importação do
  // HubSpot cria uma para cada responsável, e contá-las tiraria o primeiro
  // administrador de quem chegasse depois da migração.
  const isFirstUser = (await prisma.user.count({ where: { claimedAt: { not: null } } })) === 0;

  // ─── Quem pode criar conta ───────────────────────────────────────────
  // O domínio sozinho bastava enquanto a base era de mentira. Com a operação
  // real dentro — milhares de negócios e a carteira de cada vendedor —, um
  // e-mail do domínio não pode mais ser a única credencial: quem o tivesse
  // poderia assumir a conta importada de qualquer vendedor.
  const primeiroAdmin = env("ADMIN_EMAIL")?.toLowerCase();

  if (isFirstUser) {
    if (primeiroAdmin && email !== primeiroAdmin) {
      return { error: "Só o administrador inicial pode criar a primeira conta.", values: typed };
    }
    if (!primeiroAdmin && process.env.NODE_ENV === "production") {
      // Em produção, sem ADMIN_EMAIL definido, o primeiro cadastro seria uma
      // corrida: quem chegasse antes viraria administrador de tudo.
      return {
        error: "Cadastro fechado: falta definir ADMIN_EMAIL na configuração do servidor.",
        values: typed,
      };
    }
  } else {
    const convite = await prisma.invite.findUnique({ where: { email } });
    if (!convite || convite.usedAt) {
      return {
        error: "Este e-mail não está liberado. Peça a um administrador para liberar seu acesso.",
        values: typed,
      };
    }
  }

  // Conta importada: assumir a existente preserva os negócios, leads e tarefas
  // que já apontam para ela. Criar outra deixaria tudo órfão.
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          name,
          passwordHash: await hashPassword(password),
          claimedAt: new Date(),
          active: true,
          ...(isFirstUser ? { role: "ADMIN" as const } : {}),
        },
      })
    : await prisma.user.create({
        data: {
          name,
          email,
          passwordHash: await hashPassword(password),
          claimedAt: new Date(),
          role: isFirstUser ? "ADMIN" : "USER",
        },
      });

  // Convite é de uso único: marcá-lo aqui impede que o mesmo e-mail seja
  // recriado se a conta for removida depois.
  if (!isFirstUser) {
    await prisma.invite.update({ where: { email }, data: { usedAt: new Date() } });
  }

  await createSession(user.id);
  redirect(homeFor(user.role));
}

export async function signOut() {
  await destroySession();
  redirect("/");
}
