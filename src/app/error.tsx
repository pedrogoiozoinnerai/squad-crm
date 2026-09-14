"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Em produção o Next troca a mensagem por um digest; é ele que liga o que o
    // usuário viu ao que o servidor registrou.
    console.error("[erro]", error.digest ?? "", error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="card max-w-md p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-red-50 text-red-700">
          <AlertTriangle className="size-6" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">Algo quebrou nesta tela</h1>
        <p className="mt-2 text-sm text-muted">
          O resto do sistema segue funcionando. Tente de novo — se persistir, me
          mande o código abaixo.
        </p>
        {error.digest && (
          <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs text-muted">
            {error.digest}
          </p>
        )}
        <button type="button" onClick={reset} className="btn-primary mt-6 w-full">
          <RotateCcw className="size-4" />
          Tentar de novo
        </button>
      </div>
    </main>
  );
}
