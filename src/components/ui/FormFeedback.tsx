"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check } from "lucide-react";

import type { FormState } from "@/lib/guard";

/**
 * O que a Server Action respondeu.
 *
 * Desenhava só o erro. Quem passa `closeHref` sobrevivia porque o painel fechar
 * já é a confirmação; quem não passa ficava **mudo**: editar um lead existente
 * ou um negócio e clicar "Salvar alterações" não mudava absolutamente nada na
 * tela, e a única leitura possível era "não funcionou". Na dúvida a pessoa
 * clica de novo — e é assim que uma edição vira três.
 *
 * Agora quem não fecha nada diz que salvou.
 */
export function FormFeedback({
  state,
  closeHref,
  sucesso,
}: {
  state: FormState;
  /// Para onde ir quando der certo. Fechar o painel já é a confirmação.
  closeHref?: string;
  /// A frase de confirmação de quem NÃO fecha nada. Sem ela, o silêncio continua.
  sucesso?: string;
}) {
  const router = useRouter();
  const ok = state?.ok;

  // O "salvo" some sozinho: ele responde a um clique, não descreve o estado da
  // tela. Parado ali, continuaria dizendo "salvo" sobre um formulário que a
  // pessoa já mexeu de novo desde então.
  const [ultimo, setUltimo] = useState(state);
  const [sumiu, setSumiu] = useState(false);
  if (ultimo !== state) {
    setUltimo(state);
    setSumiu(false);
  }

  useEffect(() => {
    if (ok && closeHref) router.push(closeHref);
  }, [ok, closeHref, router]);

  useEffect(() => {
    if (!ok || sumiu) return;
    const relogio = setTimeout(() => setSumiu(true), 4000);
    return () => clearTimeout(relogio);
  }, [ok, sumiu]);

  if (state?.error) {
    return (
      <p
        role="alert"
        className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700"
      >
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        {state.error}
      </p>
    );
  }

  if (!ok || closeHref || !sucesso || sumiu) return null;

  return (
    <p
      // `status` e não `alert`: dar certo não interrompe quem usa leitor de tela.
      role="status"
      className="flex items-start gap-2 rounded-xl bg-waz-95 px-3 py-2.5 text-sm text-waz-20"
    >
      <Check className="mt-0.5 size-4 shrink-0" />
      {sucesso}
    </p>
  );
}
