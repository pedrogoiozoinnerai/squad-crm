"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Lock, Plus, Trash2 } from "lucide-react";

import {
  alternarMotivo,
  criarMotivo,
  excluirMotivo,
  moverMotivo,
  salvarMotivo,
} from "@/app/actions/settings";
import { Field } from "@/components/ui/Field";
import { FormFeedback } from "@/components/ui/FormFeedback";
import type { FormState } from "@/lib/guard";

export type LossReasonRow = {
  id: string;
  name: string;
  orderIndex: number;
  active: boolean;
  _count: { deals: number };
};

export function LossReasonList({ reasons }: { reasons: LossReasonRow[] }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const fechar = useCallback(() => {
    setEditando(null);
    setCriando(false);
  }, []);

  const ativos = reasons.filter((r) => r.active).length;

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">Motivos de perda</h2>
          <p className="mt-0.5 text-xs text-muted">
            {ativos} {ativos === 1 ? "motivo ativo" : "motivos ativos"} na lista que aparece ao
            marcar um negócio como perdido — nesta ordem.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditando(null);
            setConfirmando(null);
            setCriando((v) => !v);
          }}
          className="btn-ghost shrink-0"
        >
          <Plus className="size-4" />
          Novo motivo
        </button>
      </header>

      {criando && (
        <div className="border-b border-line bg-surface-2/50 px-5 py-4">
          <MotivoForm reason={null} onDone={fechar} />
        </div>
      )}

      {reasons.length === 0 ? (
        <p className="px-5 py-14 text-center text-sm text-muted">
          Nenhum motivo cadastrado. Crie os primeiros em <strong>Novo motivo</strong> — sem eles
          o Dashboard não consegue dizer por que a operação perde.
        </p>
      ) : (
        <ul>
          {reasons.map((reason, i) =>
            editando === reason.id ? (
              <li key={reason.id} className="border-b border-line bg-surface-2/50 px-5 py-4 last:border-b-0">
                <MotivoForm reason={reason} onDone={fechar} />
              </li>
            ) : (
              <li
                key={reason.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-b-0 sm:px-5 ${
                  reason.active ? "" : "opacity-60"
                }`}
              >
                <form action={moverMotivo} className="flex shrink-0 flex-col gap-0.5">
                  <input type="hidden" name="id" value={reason.id} />
                  <OrderButton value="up" disabled={i === 0} label={`Subir ${reason.name}`}>
                    <ArrowUp className="size-3" />
                  </OrderButton>
                  <OrderButton
                    value="down"
                    disabled={i === reasons.length - 1}
                    label={`Descer ${reason.name}`}
                  >
                    <ArrowDown className="size-3" />
                  </OrderButton>
                </form>

                <p className="min-w-[9rem] flex-1 text-sm font-medium">{reason.name}</p>

                <span
                  className={`chip shrink-0 ${
                    reason._count.deals > 0 ? "bg-red-50 text-red-700" : "bg-surface-2 text-muted"
                  }`}
                >
                  {reason._count.deals === 0
                    ? "nunca usado"
                    : `usado em ${reason._count.deals} ${reason._count.deals === 1 ? "negócio" : "negócios"}`}
                </span>

                <div className="flex shrink-0 items-center gap-1.5">
                  <form action={alternarMotivo}>
                    <input type="hidden" name="id" value={reason.id} />
                    <button
                      type="submit"
                      className={`chip transition ${
                        reason.active
                          ? "bg-waz-95 text-waz-20 hover:bg-waz-90"
                          : "bg-surface-2 text-muted hover:bg-line"
                      }`}
                      title={
                        reason.active
                          ? "Desativar: some da lista de fechamento, o histórico continua."
                          : "Reativar: volta a aparecer ao fechar um negócio como perdido."
                      }
                    >
                      {reason.active ? "Ativo" : "Inativo"}
                    </button>
                  </form>

                  <button
                    type="button"
                    onClick={() => {
                      setCriando(false);
                      setConfirmando(null);
                      setEditando(reason.id);
                    }}
                    className="chip border border-line bg-surface text-muted transition hover:text-foreground"
                  >
                    Editar
                  </button>

                  {reason._count.deals > 0 ? (
                    <span
                      className="chip cursor-not-allowed bg-surface-2 text-muted"
                      title={`Não dá para excluir: ${reason._count.deals} negócio(s) perdidos apontam para este motivo. Desative em vez de excluir.`}
                    >
                      <Lock className="size-3" />
                      Só desativar
                    </span>
                  ) : confirmando === reason.id ? (
                    <form action={excluirMotivo} className="flex items-center gap-1.5">
                      <input type="hidden" name="id" value={reason.id} />
                      <button type="submit" className="chip bg-red-600 text-white hover:bg-red-700">
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmando(null)}
                        className="chip bg-surface-2 text-muted hover:text-foreground"
                      >
                        Cancelar
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmando(reason.id)}
                      className="chip border border-line bg-surface text-muted transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="size-3" />
                      Excluir
                    </button>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      <footer className="bg-surface-2/50 px-5 py-3 text-[11px] text-muted">
        Motivo já usado em negócio perdido não se exclui — a contagem ao lado mostra quantos
        dependem dele. Desative: ele some da lista de fechamento e o Dashboard continua
        explicando as perdas antigas.
      </footer>
    </section>
  );
}

function OrderButton({
  value,
  disabled,
  label,
  children,
}: {
  value: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      name="dir"
      value={value}
      disabled={disabled}
      aria-label={label}
      className="grid size-5 place-items-center rounded-md border border-line bg-surface text-muted transition hover:text-foreground disabled:opacity-30 disabled:hover:text-muted"
    >
      {children}
    </button>
  );
}

function MotivoForm({ reason, onDone }: { reason: LossReasonRow | null; onDone: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    reason ? salvarMotivo : criarMotivo,
    null,
  );
  const ok = state?.ok;

  useEffect(() => {
    if (ok) onDone();
  }, [ok, onDone]);

  return (
    <form action={action} className="flex flex-col gap-3">
      {reason && <input type="hidden" name="id" value={reason.id} />}

      <Field label="Nome do motivo" hint="Curto e comparável: é o que vira gráfico no Dashboard.">
        <input
          name="name"
          required
          maxLength={60}
          defaultValue={reason?.name ?? ""}
          placeholder="Ex.: Preço acima do orçamento"
          className="field"
        />
      </Field>

      <FormFeedback state={state} />

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onDone} className="btn-ghost">
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending && <Loader2 className="size-4 animate-spin" />}
          {reason ? "Salvar motivo" : "Criar motivo"}
        </button>
      </div>
    </form>
  );
}
