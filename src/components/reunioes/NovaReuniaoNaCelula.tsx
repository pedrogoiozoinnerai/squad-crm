"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import { FormularioDeReuniao } from "@/components/reunioes/FormularioDeReuniao";

/**
 * O "+" que aparece ao passar o mouse numa célula vazia do calendário.
 *
 * A grade já diz o dia e a hora — que é justamente o que o formulário
 * perguntaria primeiro. Clicar onde se quer a reunião é mais curto que abrir
 * um formulário e digitar a data de novo.
 *
 * Fica por baixo dos cartões de reunião (`-z-0` contra o `relative` deles) e só
 * aparece no hover, para não competir visualmente com o que já está marcado.
 */
export function NovaReuniaoNaCelula({
  inicioEm,
  rotuloDoHorario,
  owners,
}: {
  inicioEm: string;
  rotuloDoHorario: string;
  owners?: { id: string; name: string }[];
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={`Marcar reunião ${rotuloDoHorario}`}
        title={`Marcar reunião ${rotuloDoHorario}`}
        className="absolute inset-0 z-0 grid place-items-center text-muted opacity-0 transition focus-visible:opacity-100 focus-visible:ring-4 focus-visible:ring-waz-90 group-hover/celula:opacity-100"
      >
        <Plus className="size-4" />
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-8">
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setAberto(false)}
            className="fixed inset-0 -z-10 cursor-default"
          />
          <div className="card w-full max-w-xl p-5 text-left">
            <header className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Nova reunião</h2>
                <p className="mt-0.5 text-xs text-muted capitalize">{rotuloDoHorario}</p>
              </div>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar"
                className="rounded-lg p-1 text-muted transition hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </header>

            <FormularioDeReuniao
              padrao={{ inicioEm }}
              owners={owners}
              aoConcluir={() => setAberto(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
