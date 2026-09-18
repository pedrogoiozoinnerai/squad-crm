"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { FormularioDeReuniao } from "@/components/reunioes/FormularioDeReuniao";
import { Modal } from "@/components/ui/Modal";

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
        <Modal
          titulo="Nova reunião"
          descricao={<span className="capitalize">{rotuloDoHorario}</span>}
          aoFechar={() => setAberto(false)}
        >
          <FormularioDeReuniao
            padrao={{ inicioEm }}
            owners={owners}
            aoConcluir={() => setAberto(false)}
          />
        </Modal>
      )}
    </>
  );
}
