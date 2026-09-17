"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Lock, Plus, Trash2 } from "lucide-react";

import { criarEtapa, excluirEtapa, moverEtapa, salvarEtapa } from "@/app/actions/settings";
import { Field } from "@/components/ui/Field";
import { Acao } from "@/components/ui/Acao";
import { FormFeedback } from "@/components/ui/FormFeedback";
import type { FormState } from "@/lib/guard";

export type StageRow = {
  id: string;
  key: string;
  name: string;
  color: string;
  order: number;
  targetRole: string | null;
  _count: { deals: number };
};

const ROLES = [
  { value: "", label: "Qualquer um" },
  { value: "SDR", label: "SDR" },
  { value: "CLOSER", label: "Closer" },
  { value: "CS", label: "CS" },
];

/** Cores já usadas no funil — o admin ainda pode escolher qualquer outra. */
const CORES = ["#a8a29e", "#e8912d", "#0ea5e9", "#8b5cf6", "#2dc86a", "#ef4444", "#14b8a6"];

export function StageList({ stages }: { stages: StageRow[] }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const fechar = useCallback(() => {
    setEditando(null);
    setCriando(false);
  }, []);

  const emUso = stages.filter((s) => s._count.deals > 0).length;

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">Etapas do pipeline</h2>
          <p className="mt-0.5 text-xs text-muted">
            A ordem daqui é a ordem das colunas no pipeline. Renomear e trocar a cor é
            seguro: os negócios continuam onde estão.
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
          Nova etapa
        </button>
      </header>

      {criando && (
        <div className="border-b border-line bg-surface-2/50 px-5 py-4">
          <EtapaForm stage={null} onDone={fechar} />
        </div>
      )}

      {stages.length === 0 ? (
        <p className="px-5 py-14 text-center text-sm text-muted">
          Nenhuma etapa cadastrada. Crie a primeira em <strong>Nova etapa</strong> — sem
          etapa não existe pipeline.
        </p>
      ) : (
        <ul>
          {stages.map((stage, i) =>
            editando === stage.id ? (
              <li key={stage.id} className="border-b border-line bg-surface-2/50 px-5 py-4 last:border-b-0">
                <EtapaForm stage={stage} onDone={fechar} />
              </li>
            ) : (
              <li
                key={stage.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-b-0 sm:px-5"
              >
                <Acao action={moverEtapa} mensagem="Não deu para mudar a etapa de lugar." className="flex shrink-0 flex-col gap-0.5">
                  <input type="hidden" name="id" value={stage.id} />
                  <OrderButton name="dir" value="up" disabled={i === 0} label={`Subir ${stage.name}`}>
                    <ArrowUp className="size-3" />
                  </OrderButton>
                  <OrderButton
                    name="dir"
                    value="down"
                    disabled={i === stages.length - 1}
                    label={`Descer ${stage.name}`}
                  >
                    <ArrowDown className="size-3" />
                  </OrderButton>
                </Acao>

                <span
                  className="size-7 shrink-0 rounded-lg"
                  style={{ backgroundColor: stage.color }}
                  aria-hidden
                />

                <div className="min-w-[9rem] flex-1">
                  <p className="text-sm font-medium">{stage.name}</p>
                  <p className="text-[11px] text-muted">
                    <span className="font-mono">{stage.key}</span>
                    {stage.targetRole && ` · opera ${stage.targetRole}`}
                  </p>
                </div>

                <span
                  className={`chip shrink-0 ${
                    stage._count.deals > 0 ? "bg-waz-95 text-waz-20" : "bg-surface-2 text-muted"
                  }`}
                >
                  {stage._count.deals === 0
                    ? "sem negócios"
                    : `usado em ${stage._count.deals} ${stage._count.deals === 1 ? "negócio" : "negócios"}`}
                </span>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCriando(false);
                      setConfirmando(null);
                      setEditando(stage.id);
                    }}
                    className="chip border border-line bg-surface text-muted transition hover:text-foreground"
                  >
                    Editar
                  </button>

                  {stage._count.deals > 0 || stages.length === 1 ? (
                    <span
                      className="chip cursor-not-allowed bg-surface-2 text-muted"
                      title={
                        stage._count.deals > 0
                          ? `Não dá para remover: ${stage._count.deals} negócio(s) estão nesta etapa. Mova-os para outra etapa primeiro.`
                          : "Não dá para remover: o pipeline precisa de ao menos uma etapa. Crie outra antes."
                      }
                    >
                      <Lock className="size-3" />
                      Não removível
                    </span>
                  ) : confirmando === stage.id ? (
                    <Acao action={excluirEtapa} mensagem="Não deu para excluir a etapa." className="flex items-center gap-1.5">
                      <input type="hidden" name="id" value={stage.id} />
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
                    </Acao>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmando(stage.id)}
                      className="chip border border-line bg-surface text-muted transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="size-3" />
                      Remover
                    </button>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      <footer className="bg-surface-2/50 px-5 py-3 text-[11px] text-muted">
        {stages.length === 1
          ? "O pipeline precisa de ao menos uma etapa: esta só libera para remoção depois que você criar outra."
          : emUso > 0
            ? `${emUso} ${emUso === 1 ? "etapa está" : "etapas estão"} com negócio dentro e por isso ${
                emUso === 1 ? "não pode ser removida" : "não podem ser removidas"
              } — apagar a etapa apagaria os negócios junto. Mova os negócios para outra etapa no pipeline e o botão libera.`
            : "Etapa com negócio dentro não pode ser removida: apagar a etapa apagaria os negócios junto."}
      </footer>
    </section>
  );
}

function OrderButton({
  name,
  value,
  disabled,
  label,
  children,
}: {
  name: string;
  value: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={disabled}
      aria-label={label}
      className="grid size-5 place-items-center rounded-md border border-line bg-surface text-muted transition hover:text-foreground disabled:opacity-30 disabled:hover:text-muted"
    >
      {children}
    </button>
  );
}

function EtapaForm({ stage, onDone }: { stage: StageRow | null; onDone: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    stage ? salvarEtapa : criarEtapa,
    null,
  );
  const ok = state?.ok;

  useEffect(() => {
    if (ok) onDone();
  }, [ok, onDone]);

  return (
    <form action={action} className="flex flex-col gap-3">
      {stage && <input type="hidden" name="id" value={stage.id} />}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_10rem]">
        <Field label="Nome da etapa">
          <input
            name="name"
            required
            maxLength={40}
            defaultValue={stage?.name ?? ""}
            placeholder="Ex.: Negociação"
            className="field"
          />
        </Field>

        <Field label="Cor">
          <input
            type="color"
            name="color"
            defaultValue={stage?.color ?? CORES[0]}
            list="cores-etapa"
            className="h-[42px] w-20 cursor-pointer rounded-xl border border-line bg-surface p-1"
          />
        </Field>

        <Field label="Quem opera">
          <select name="targetRole" defaultValue={stage?.targetRole ?? ""} className="field">
            {ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <datalist id="cores-etapa">
        {CORES.map((cor) => (
          <option key={cor} value={cor} />
        ))}
      </datalist>

      <FormFeedback state={state} />

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onDone} className="btn-ghost">
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending && <Loader2 className="size-4 animate-spin" />}
          {stage ? "Salvar etapa" : "Criar etapa"}
        </button>
      </div>
    </form>
  );
}
