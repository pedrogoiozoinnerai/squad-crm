"use client";

import { useActionState } from "react";
import { Timer } from "lucide-react";

import { salvarRegraDePresenca } from "@/app/actions/settings";
import { Field, SubmitRow } from "@/components/ui/Field";
import { FormFeedback } from "@/components/ui/FormFeedback";
import type { FormState } from "@/lib/guard";

/**
 * Quando alguém "esteve" na reunião.
 *
 * É regra de negócio, não constante: o que conta como presença numa demo de 20
 * minutos não é o que conta numa mentoria de duas horas. O schema já dizia
 * isso e a tela de Sessões já prometia que dava para editar aqui — só que esta
 * tela não existia, e a régua ficava presa no padrão.
 */
export function RegraDePresenca({
  presencaMinutos,
  presencaPercentual,
}: {
  presencaMinutos: number;
  presencaPercentual: number;
}) {
  const [estado, acao, salvando] = useActionState<FormState, FormData>(
    salvarRegraDePresenca,
    null,
  );

  return (
    <section className="card overflow-hidden">
      <header className="border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Timer className="size-4 text-muted" />
          Régua de presença
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          O que a sala precisa medir para considerar alguém presente. Vale para as sessões
          coletivas, para o <strong>Assistido</strong> do negócio e para a taxa que o time
          discute na reunião de operação.
        </p>
      </header>

      <form action={acao} className="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mínimo de minutos na sala" hint="0 desliga este critério">
            <input
              name="presencaMinutos"
              type="number"
              min={0}
              max={240}
              defaultValue={presencaMinutos}
              required
              className="field"
            />
          </Field>
          <Field label="Mínimo em % da duração" hint="0 desliga este critério">
            <input
              name="presencaPercentual"
              type="number"
              min={0}
              max={100}
              defaultValue={presencaPercentual}
              required
              className="field"
            />
          </Field>
        </div>

        <p className="mt-4 flex items-start gap-2.5 rounded-xl border border-waz-80 bg-waz-95 px-4 py-3 text-xs leading-relaxed text-waz-20">
          <Timer className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>Os dois critérios valem juntos.</strong> Só o percentual deixaria
            &ldquo;3 minutos de uma call de 5&rdquo; passar como presença; só o número
            absoluto trataria 10 minutos de uma mentoria de duas horas como participação
            plena.{" "}
            {presencaPercentual === 0 ? (
              <>
                Hoje vale só o mínimo de <strong>{presencaMinutos} min</strong>.
              </>
            ) : (
              <>
                Hoje: <strong>{presencaMinutos} min</strong> <em>e</em>{" "}
                <strong>{presencaPercentual}%</strong> da duração.
              </>
            )}
          </span>
        </p>

        <p className="mt-3 text-xs text-muted">
          Mudar aqui não reescreve o passado: cada inscrito guarda a régua que produziu o
          veredicto dele. A nova vale a partir da próxima reconciliação.
        </p>

        <FormFeedback state={estado} sucesso="Regra de presença salva." />
        <SubmitRow>
          <button type="submit" disabled={salvando} className="btn-primary">
            {salvando ? "Salvando…" : "Salvar régua"}
          </button>
        </SubmitRow>
      </form>
    </section>
  );
}
