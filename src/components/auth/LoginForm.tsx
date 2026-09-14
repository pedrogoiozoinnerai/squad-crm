"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { signIn, signUp, type AuthState } from "@/app/actions/auth";

type Mode = "signin" | "signup";

export function LoginForm({ domain }: { domain: string }) {
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
  const error = state?.error;
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
