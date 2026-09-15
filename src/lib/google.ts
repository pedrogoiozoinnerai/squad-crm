import "server-only";

import { randomBytes } from "node:crypto";

import { env } from "@/lib/env";

/**
 * Login com Google Workspace, escrito à mão.
 *
 * Sem biblioteca de autenticação: o que precisamos do OIDC são duas rotas e uma
 * troca de código, e a sessão já existe neste projeto (`createSession`). Uma
 * camada a mais traria seu próprio modelo de sessão, seu próprio cookie e suas
 * próprias regras de papel — três coisas que teríamos de reconciliar com as
 * nossas. O ganho seria conveniência; o custo, duas fontes de verdade sobre
 * quem está logado.
 */
const AUTORIZACAO = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";

export const ESTADO_COOKIE = "squad_crm_oauth";

export function googleConfigurado() {
  return Boolean(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"));
}

/**
 * A URL de retorno precisa bater exatamente com a cadastrada no Google.
 *
 * Em produção vem de NEXT_PUBLIC_APP_URL; localmente, do host da requisição,
 * para não exigir configuração de quem só quer rodar o projeto.
 */
export function urlDeRetorno(origem: string) {
  const base = env("NEXT_PUBLIC_APP_URL") ?? origem;
  return new URL("/api/auth/google/callback", base).toString();
}

export function novoEstado() {
  return randomBytes(24).toString("hex");
}

export function urlDeLogin(estado: string, origem: string) {
  const params = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID")!,
    redirect_uri: urlDeRetorno(origem),
    response_type: "code",
    scope: "openid email profile",
    state: estado,
    // `hd` faz o Google já filtrar a lista de contas pelo domínio. É conforto,
    // não segurança: o valor volta no token e é conferido de novo no servidor.
    hd: env("ALLOWED_EMAIL_DOMAIN", "innerai.com")!,
    // Sem isto, quem tem várias contas Google entra sempre com a última usada.
    prompt: "select_account",
  });
  return `${AUTORIZACAO}?${params}`;
}

export type IdentidadeGoogle = {
  sub: string;
  email: string;
  emailVerificado: boolean;
  nome: string;
  dominio?: string;
};

/**
 * Troca o código pelo token e lê a identidade.
 *
 * O `id_token` não é verificado por assinatura porque ele não passou pelo
 * navegador: veio da resposta direta do Google ao nosso servidor, por TLS,
 * autenticado com o nosso client_secret. É o caso em que a própria documentação
 * do Google dispensa a verificação. Se um dia o token chegar por outro caminho,
 * a verificação passa a ser obrigatória.
 */
export async function trocarCodigo(codigo: string, origem: string): Promise<IdentidadeGoogle> {
  const resposta = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: codigo,
      client_id: env("GOOGLE_CLIENT_ID")!,
      client_secret: env("GOOGLE_CLIENT_SECRET")!,
      redirect_uri: urlDeRetorno(origem),
      grant_type: "authorization_code",
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(`Google recusou a troca do código (${resposta.status}): ${corpo.slice(0, 200)}`);
  }

  const { id_token } = (await resposta.json()) as { id_token?: string };
  if (!id_token) throw new Error("Google não devolveu id_token.");

  const [, payload] = id_token.split(".");
  if (!payload) throw new Error("id_token malformado.");

  const dados = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    hd?: string;
  };

  if (!dados.email) throw new Error("Google não devolveu o e-mail.");

  return {
    sub: dados.sub,
    email: dados.email.toLowerCase(),
    emailVerificado: dados.email_verified === true,
    nome: dados.name ?? dados.email.split("@")[0],
    dominio: dados.hd,
  };
}
