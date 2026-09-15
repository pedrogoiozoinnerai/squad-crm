"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { signIn, signUp, type AuthState } from "@/app/actions/auth";

type Mode = "signin" | "signup";

/** Marca do Google. Inline porque a CSP do projeto não carrega imagem externa. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * O SSO recusa por motivos diferentes, e cada um pede uma ação diferente de
 * quem está na frente da tela. "Falhou, tente de novo" faria a pessoa repetir
 * um caminho que nunca vai dar certo.
 */
const ERRO_SSO: Record<string, string> = {
  "sso-indisponivel": "Entrada com Google ainda não está configurada neste ambiente.",
  "sso-incompleto": "O Google não concluiu o login. Tente de novo.",
  "sso-expirado": "A tentativa demorou demais. Comece de novo.",
  "sso-estado": "Não foi possível validar a origem do login. Comece de novo por esta página.",
  "sso-falhou": "O Google recusou o login. Tente de novo.",
  "sso-nao-verificado": "Seu e-mail não está verificado no Google.",
  "sso-dominio": "Use sua conta corporativa. Contas Google pessoais não entram aqui.",
  "sso-inativa": "Sua conta está desativada. Fale com um administrador.",
  "sso-sem-admin": "Cadastro fechado: falta definir ADMIN_EMAIL na configuração do servidor.",
  "sso-nao-liberado": "Este e-mail não está liberado. Peça a um administrador para liberar seu acesso.",
};

export function LoginForm({
  domain,
  googleAtivo,
  erroSso,
}: {
  domain: string;
  googleAtivo: boolean;
  erroSso?: string;
}) {
  const [mode, setMode] = useState<Mode>("signin");

  const [signInState, signInAction, signingIn] = useActionState<AuthState, FormData>(
    signIn,
    null,
  );
  const [signUpState, signUpAction, signingUp] = useActionState<AuthState, FormData>(
    signUp,
    null,
  );

  const isSignUp = mode === "signup";
  const pending = isSignUp ? signingUp : signingIn;
  const state = isSignUp ? signUpState : signInState;
  const error = state?.error ?? (erroSso ? (ERRO_SSO[erroSso] ?? "Não foi possível entrar com o Google.") : undefined);
  const values = state?.values;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-9 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-black.svg" alt="Squad.com" className="h-6 w-auto" />
          <p className="mt-4 text-2xl font-semibold tracking-tight">CRM</p>
          <p className="mt-1 text-sm text-muted">
            {isSignUp ? "Crie sua conta do time." : "Entre com sua conta do time."}
          </p>
        </div>

        {googleAtivo && (
          <div className="mb-5">
            <a href="/api/auth/google" className="btn-ghost w-full justify-center gap-2.5 py-2.5">
              <GoogleMark />
              Entrar com Google
            </a>
            <div className="mt-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-xs text-muted">ou com e-mail e senha</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          </div>
        )}

        <form
          key={mode}
          action={isSignUp ? signUpAction : signInAction}
          className="card p-6 shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_32px_-12px_rgba(15,23,42,.12)]"
        >
          <div className="flex flex-col gap-4">
            {isSignUp && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted">Nome</span>
                <input
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  defaultValue={values?.name ?? ""}
                  placeholder="Seu nome"
                  className="field"
                />
              </label>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted">E-mail</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                defaultValue={values?.email ?? ""}
                placeholder={`voce@${domain}`}
                className="field"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted">Senha</span>
              <input
                name="password"
                type="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                required
                minLength={8}
                placeholder={isSignUp ? "Mínimo de 8 caracteres" : "••••••••"}
                className="field"
              />
            </label>

            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            )}

            <button type="submit" disabled={pending} className="btn-primary mt-1 w-full">
              {pending && <Loader2 className="size-4 animate-spin" />}
              {isSignUp ? "Criar conta" : "Entrar"}
            </button>
          </div>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          {isSignUp ? "Já tem conta?" : "Ainda não tem conta?"}{" "}
          <button
            type="button"
            onClick={() => setMode(isSignUp ? "signin" : "signup")}
            className="font-semibold text-waz-30 underline-offset-4 hover:underline"
          >
            {isSignUp ? "Entrar" : "Criar conta"}
          </button>
        </p>

        {isSignUp && (
          <p className="mt-2 text-center text-xs text-muted">
            Cadastro liberado apenas para e-mails <strong>@{domain}</strong>.
          </p>
        )}
      </div>
    </main>
  );
}
