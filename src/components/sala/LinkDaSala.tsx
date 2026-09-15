"use client";

import { useState } from "react";
import { Check, Copy, Video } from "lucide-react";

/**
 * Entrar na sala e copiar o convite, do lado do CRM.
 *
 * Dois botões e nada mais: na hora da call o vendedor não quer um menu, quer
 * entrar. O convite fica ao lado porque o momento em que ele lembra de mandar
 * o link é justamente esse — quando abre a agenda e vê a reunião.
 */
export function LinkDaSala({
  meetingId,
  convite,
  compacto,
}: {
  meetingId: string;
  convite: string | null;
  compacto?: boolean;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    if (!convite) return;
    const url = `${window.location.origin}/convite/${convite}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Área de transferência negada (permissão, http sem TLS): mostrar o
      // endereço é melhor que um botão que não faz nada.
      window.prompt("Copie o link do convite:", url);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <a
        href={`/sala/${meetingId}`}
        className={compacto ? "btn-primary px-3 py-1.5 text-xs" : "btn-primary"}
      >
        <Video className="size-3.5" />
        Entrar na sala
      </a>

      {convite && (
        <button
          type="button"
          onClick={() => void copiar()}
          className={`btn-ghost ${compacto ? "px-3 py-1.5 text-xs" : ""}`}
          aria-live="polite"
        >
          {copiado ? <Check className="size-3.5 text-waz-30" /> : <Copy className="size-3.5" />}
          {copiado ? "Copiado" : "Copiar convite"}
        </button>
      )}
    </div>
  );
}
