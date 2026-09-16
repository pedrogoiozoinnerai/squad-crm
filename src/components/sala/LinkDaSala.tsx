"use client";

import { useState } from "react";
import { Check, Link2, UserRound, Video } from "lucide-react";

/**
 * Entrar na sala e pegar os links, do lado do CRM.
 *
 * O momento em que o vendedor lembra de mandar o endereço é justamente este —
 * quando abre a agenda e vê a reunião. Por isso os links ficam ao lado do
 * botão de entrar, e não numa tela a mais.
 *
 * São dois e não são intercambiáveis: o da reunião vale para qualquer um, o
 * convite é de UMA pessoa inscrita e identifica quem entrou. Mandar o convite
 * de um lead para outra pessoa faria a presença dela contar como a dele.
 */
export function LinkDaSala({
  meetingId,
  convite,
  link,
  compacto,
}: {
  meetingId: string;
  convite: string | null;
  /// Token do link da reunião. Nulo nas reuniões criadas antes de ele existir.
  link?: string | null;
  compacto?: boolean;
}) {
  const [copiado, setCopiado] = useState<"link" | "convite" | null>(null);

  async function copiar(qual: "link" | "convite", caminho: string) {
    const url = `${window.location.origin}${caminho}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(qual);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      // Área de transferência negada (permissão, http sem TLS): mostrar o
      // endereço é melhor que um botão que não faz nada.
      window.prompt("Copie o link:", url);
    }
  }

  const tamanho = compacto ? "px-3 py-1.5 text-xs" : "";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <a href={`/sala/${meetingId}`} className={`btn-primary ${tamanho}`}>
        <Video className="size-3.5" />
        Entrar na sala
      </a>

      {link && (
        <button
          type="button"
          onClick={() => void copiar("link", `/entrar/${link}`)}
          className={`btn-ghost ${tamanho}`}
          title="Link da reunião — vale para qualquer pessoa"
          aria-live="polite"
        >
          {copiado === "link" ? (
            <Check className="size-3.5 text-waz-30" />
          ) : (
            <Link2 className="size-3.5" />
          )}
          {copiado === "link" ? "Copiado" : "Link da reunião"}
        </button>
      )}

      {convite && (
        <button
          type="button"
          onClick={() => void copiar("convite", `/convite/${convite}`)}
          className={`btn-ghost ${tamanho}`}
          title="Convite do lead — pessoal, é o que faz a presença contar"
          aria-live="polite"
        >
          {copiado === "convite" ? (
            <Check className="size-3.5 text-waz-30" />
          ) : (
            <UserRound className="size-3.5" />
          )}
          {copiado === "convite" ? "Copiado" : "Convite do lead"}
        </button>
      )}
    </div>
  );
}
