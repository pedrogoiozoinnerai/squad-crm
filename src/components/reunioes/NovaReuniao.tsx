"use client";

import { useState } from "react";
import { CalendarPlus, Plus, X } from "lucide-react";

import {
  FormularioDeReuniao,
  type PadraoDaReuniao,
} from "@/components/reunioes/FormularioDeReuniao";

/**
 * O botão "Nova reunião" e o painel que ele abre.
 *
 * Um componente para os cinco lugares — agenda, calendário, sessões, negócio e
 * lead. Antes existia UM caminho para marcar reunião no CRM inteiro, dentro da
 * gaveta de um lead: quem quisesse marcar precisava primeiro achar um lead,
 * mesmo quando a reunião não era de nenhum.
 */
export function NovaReuniao({
  padrao,
  owners,
  rotulo = "Nova reunião",
  variante = "primaria",
}: {
  padrao?: PadraoDaReuniao;
  owners?: { id: string; name: string }[];
  rotulo?: string;
  variante?: "primaria" | "discreta";
}) {
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={variante === "primaria" ? "btn-primary shrink-0" : "btn-ghost shrink-0"}
      >
        {variante === "primaria" ? <Plus className="size-4" /> : <CalendarPlus className="size-4" />}
        {rotulo}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-8">
      <button
        type="button"
        aria-label="Fechar"
        onClick={() => setAberto(false)}
        className="fixed inset-0 -z-10 cursor-default"
      />
      <div className="card w-full max-w-xl p-5">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{rotulo}</h2>
            <p className="mt-0.5 text-xs text-muted">
              A sala abre 30 minutos antes e o convite do lead nasce junto.
            </p>
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

        {/* `key` remonta o formulário a cada abertura: reabrir depois de
            agendar não pode trazer de volta o estado da reunião anterior. */}
        <FormularioDeReuniao
          key={aberto ? "aberto" : "fechado"}
          padrao={padrao}
          owners={owners}
          aoConcluir={() => setAberto(false)}
        />
      </div>
    </div>
  );
}
