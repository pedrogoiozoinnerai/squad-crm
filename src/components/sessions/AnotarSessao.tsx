"use client";

import { useActionState, useEffect, useRef } from "react";
import { StickyNote } from "lucide-react";

import { anotarSessao } from "@/app/actions/sessoes";
import { FormFeedback } from "@/components/ui/FormFeedback";
import type { FormState } from "@/lib/guard";

/**
 * O que o closer aprendeu nesta call.
 *
 * Fica acima da lista, e não embaixo: quem abre esta aba acabou de sair da
 * sessão e quer escrever, não ler. Quem quer ler rola.
 */
export function AnotarSessao({ meetingId }: { meetingId: string }) {
  const [estado, acao, salvando] = useActionState<FormState, FormData>(anotarSessao, null);
  const campo = useRef<HTMLTextAreaElement>(null);

  // Limpa depois de gravar. Sem isto, o texto continua no campo e quem escreve
  // duas anotações seguidas manda a primeira de novo sem perceber.
  useEffect(() => {
    if (estado?.ok && campo.current) campo.current.value = "";
  }, [estado]);

  return (
    <form action={acao} className="card flex flex-col gap-3 p-4">
      <input type="hidden" name="meetingId" value={meetingId} />
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <StickyNote className="size-3.5" />
          Anotação da sessão
        </span>
        <textarea
          ref={campo}
          name="content"
          rows={3}
          required
          minLength={2}
          maxLength={4000}
          placeholder="A objeção de preço apareceu três vezes. O slide de cases travou."
          // `text-base`: abaixo de 16px o Safari do iPhone dá zoom sozinho ao
          // focar o campo, e a página sai do lugar.
          className="field resize-y text-base sm:text-sm"
        />
      </label>
      <FormFeedback state={estado} />
      <div className="flex justify-end">
        <button type="submit" disabled={salvando} className="btn btn-primary text-sm">
          {salvando ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
