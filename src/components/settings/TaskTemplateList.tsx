"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { CalendarPlus, Loader2, MessageSquareText, Plus } from "lucide-react";

import { alternarTemplate, criarTemplate, salvarTemplate } from "@/app/actions/settings";
import { Field } from "@/components/ui/Field";
import { FormFeedback } from "@/components/ui/FormFeedback";
import type { FormState } from "@/lib/guard";

export type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  messageText: string | null;
  meetingEnabled: boolean;
  active: boolean;
  _count: { tasks: number };
};

const TYPES = [
  { value: "follow_up", label: "Follow-up" },
  { value: "call_individual", label: "Call individual" },
  { value: "call", label: "Call" },
  { value: "message", label: "Mensagem" },
];

const PRIORITIES = [
  { value: "HIGH", label: "Alta", tone: "bg-red-50 text-red-700" },
  { value: "MEDIUM", label: "Média", tone: "bg-amber-50 text-amber-800" },
  { value: "LOW", label: "Baixa", tone: "bg-surface-2 text-muted" },
];

function labelDoTipo(type: string) {
  return TYPES.find((t) => t.value === type)?.label ?? type;
}

function prioridade(value: string) {
  return PRIORITIES.find((p) => p.value === value) ?? PRIORITIES[1];
}

export function TaskTemplateList({ templates }: { templates: TemplateRow[] }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  const fechar = useCallback(() => {
    setEditando(null);
    setCriando(false);
  }, []);

  const ativos = templates.filter((t) => t.active).length;

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">Templates de tarefa</h2>
          <p className="mt-0.5 text-xs text-muted">
            {`${ativos} ${ativos === 1 ? "template ativo" : "templates ativos"}.`} É daqui que
            saem o assunto, a prioridade e a mensagem pronta das tarefas criadas pelas automações.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditando(null);
            setCriando((v) => !v);
          }}
          className="btn-ghost shrink-0"
        >
          <Plus className="size-4" />
          Novo template
        </button>
      </header>

      {criando && (
        <div className="border-b border-line bg-surface-2/50 px-5 py-4">
          <TemplateForm template={null} onDone={fechar} />
        </div>
      )}

      {templates.length === 0 ? (
        <p className="px-5 py-14 text-center text-sm text-muted">
          Nenhum template cadastrado. Crie o primeiro em <strong>Novo template</strong> — sem
          template, nenhuma automação de etapa tem o que criar.
        </p>
      ) : (
        <ul>
          {templates.map((template) =>
            editando === template.id ? (
              <li
                key={template.id}
                className="border-b border-line bg-surface-2/50 px-5 py-4 last:border-b-0"
              >
                <TemplateForm template={template} onDone={fechar} />
              </li>
            ) : (
              <li
                key={template.id}
                className={`flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-line px-4 py-3.5 last:border-b-0 sm:px-5 ${
                  template.active ? "" : "opacity-60"
                }`}
              >
                <div className="min-w-[12rem] flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {template.name}
                    <span className="chip bg-surface-2 text-[10px] text-muted">
                      {labelDoTipo(template.type)}
                    </span>
                    <span className={`chip text-[10px] ${prioridade(template.priority).tone}`}>
                      {prioridade(template.priority).label}
                    </span>
                    {template.meetingEnabled && (
                      <span
                        className="chip bg-sky-50 text-[10px] text-sky-700"
                        title="A tarefa sugere agendar reunião."
                      >
                        <CalendarPlus className="size-3" />
                        Agenda reunião
                      </span>
                    )}
                  </p>

                  {template.description && (
                    <p className="mt-1 text-xs text-muted">{template.description}</p>
                  )}

                  {template.messageText && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-muted">
                      <MessageSquareText className="mt-0.5 size-3 shrink-0" />
                      <span className="line-clamp-2 italic">{template.messageText}</span>
                    </p>
                  )}
                </div>

                <span
                  className={`chip shrink-0 ${
                    template._count.tasks > 0 ? "bg-waz-95 text-waz-20" : "bg-surface-2 text-muted"
                  }`}
                >
                  {template._count.tasks === 0
                    ? "nunca gerou tarefa"
                    : `usado em ${template._count.tasks} ${template._count.tasks === 1 ? "tarefa" : "tarefas"}`}
                </span>

                <div className="flex shrink-0 items-center gap-1.5">
                  <form action={alternarTemplate}>
                    <input type="hidden" name="id" value={template.id} />
                    <button
                      type="submit"
                      className={`chip transition ${
                        template.active
                          ? "bg-waz-95 text-waz-20 hover:bg-waz-90"
                          : "bg-surface-2 text-muted hover:bg-line"
                      }`}
                      title={
                        template.active
                          ? "Desativar: as automações param de criar esta tarefa na hora."
                          : "Reativar: as automações voltam a criar esta tarefa."
                      }
                    >
                      {template.active ? "Ativo" : "Inativo"}
                    </button>
                  </form>

                  <button
                    type="button"
                    onClick={() => {
                      setCriando(false);
                      setEditando(template.id);
                    }}
                    className="chip border border-line bg-surface text-muted transition hover:text-foreground"
                  >
                    Editar
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      <footer className="bg-surface-2/50 px-5 py-3 text-[11px] text-muted">
        Template não se exclui: as tarefas já criadas apontam para ele. Desativar já resolve — as
        automações param de criá-lo imediatamente, e as tarefas que estão na fila do time
        continuam intactas, porque copiaram o texto no momento em que nasceram.
      </footer>
    </section>
  );
}

function TemplateForm({ template, onDone }: { template: TemplateRow | null; onDone: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    template ? salvarTemplate : criarTemplate,
    null,
  );
  const ok = state?.ok;

  useEffect(() => {
    if (ok) onDone();
  }, [ok, onDone]);

  return (
    <form action={action} className="flex flex-col gap-3">
      {template && <input type="hidden" name="id" value={template.id} />}

      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_8rem]">
        <Field label="Nome da tarefa">
          <input
            name="name"
            required
            maxLength={60}
            defaultValue={template?.name ?? ""}
            placeholder="Ex.: Follow-up da proposta"
            className="field"
          />
        </Field>

        <Field label="Tipo">
          <select name="type" defaultValue={template?.type ?? "follow_up"} className="field">
            {TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Prioridade">
          <select name="priority" defaultValue={template?.priority ?? "MEDIUM"} className="field">
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Descrição" hint="O que o vendedor precisa fazer, em uma linha.">
        <input
          name="description"
          maxLength={300}
          defaultValue={template?.description ?? ""}
          className="field"
        />
      </Field>

      <Field
        label="Mensagem pronta"
        hint="Texto sugerido ao lead quando a tarefa aparece. Deixe vazio se não houver."
      >
        <textarea
          name="messageText"
          rows={3}
          maxLength={2000}
          defaultValue={template?.messageText ?? ""}
          className="field resize-y"
        />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="meetingEnabled"
          defaultChecked={template?.meetingEnabled ?? false}
          className="size-4 accent-waz-30"
        />
        Esta tarefa sugere agendar uma reunião
      </label>

      <FormFeedback state={state} />

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onDone} className="btn-ghost">
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending && <Loader2 className="size-4 animate-spin" />}
          {template ? "Salvar template" : "Criar template"}
        </button>
      </div>
    </form>
  );
}
