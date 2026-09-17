"use client";

import { useActionState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";

import { salvarRetencao } from "@/app/actions/settings";
import { Field, SubmitRow } from "@/components/ui/Field";
import { FormFeedback } from "@/components/ui/FormFeedback";
import type { FormState } from "@/lib/guard";

/**
 * Por quanto tempo a call fica guardada.
 *
 * Dois prazos diferentes de propósito: o VÍDEO é a conversa inteira de um
 * cliente e é o que pesa 550 MB por hora; a TRANSCRIÇÃO é o que sustenta o
 * resumo e a auditoria depois que o arquivo já foi embora. Guardar o texto por
 * mais tempo que o vídeo é o que permite manter o histórico de desempenho do
 * time sem manter o rosto e a voz de quem comprou.
 *
 * Os dois nascem em 0 — guardar para sempre. Não é preguiça de escolher um
 * padrão: é que apagar material de vendas por omissão seria pior que qualquer
 * atraso em decidir, e este número não é do código.
 */
export function Retencao({
  retencaoVideoDias,
  retencaoTranscricaoDias,
}: {
  retencaoVideoDias: number;
  retencaoTranscricaoDias: number;
}) {
  const [estado, acao, salvando] = useActionState<FormState, FormData>(salvarRetencao, null);
  const desligado = retencaoVideoDias === 0 && retencaoTranscricaoDias === 0;

  return (
    <section className="card overflow-hidden">
      <header className="border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Trash2 className="size-4 text-muted" />
          Retenção das gravações
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          Por quanto tempo o vídeo e a transcrição de cada call ficam guardados. Passado o
          prazo, a varredura apaga — e não há como desfazer.
        </p>
      </header>

      <form action={acao} className="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Vídeo, em dias" hint="0 guarda para sempre">
            <input
              name="retencaoVideoDias"
              type="number"
              min={0}
              max={3650}
              defaultValue={retencaoVideoDias}
              required
              className="field"
            />
          </Field>
          <Field label="Transcrição e citações, em dias" hint="0 guarda para sempre">
            <input
              name="retencaoTranscricaoDias"
              type="number"
              min={0}
              max={3650}
              defaultValue={retencaoTranscricaoDias}
              required
              className="field"
            />
          </Field>
        </div>

        <p className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            {desligado ? (
              <>
                <strong>Nada é apagado hoje.</strong> Os dois prazos estão em 0, que é o
                padrão — este número é decisão de quem responde por privacidade, não do
                sistema, e o termo que o lead aceita precisa dizer o mesmo que estiver
                aqui.
              </>
            ) : (
              <>
                <strong>Isto apaga de verdade.</strong> Ao vencer o prazo, o arquivo sai do
                bucket e a fala literal some das citações da auditoria — os números
                (nota, aderência, erros) ficam, para o histórico do time continuar
                comparável. Confira se o termo que o lead aceita diz o mesmo prazo.
              </>
            )}
          </span>
        </p>

        <p className="mt-3 text-xs text-muted">
          O vídeo não pode durar mais que a transcrição: é ela que sustenta o resumo e a
          auditoria depois que o arquivo for embora.
        </p>

        <FormFeedback state={estado} />
        <SubmitRow>
          <button type="submit" disabled={salvando} className="btn-primary">
            {salvando ? "Salvando…" : "Salvar prazos"}
          </button>
        </SubmitRow>
      </form>
    </section>
  );
}
