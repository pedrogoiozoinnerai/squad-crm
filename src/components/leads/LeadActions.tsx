"use client";

import { useActionState, useEffect, useState } from "react";
import { ArrowRightLeft, CalendarPlus, ListPlus, Loader2, StickyNote, XCircle } from "lucide-react";

import { convertLead, markLeadLost } from "@/app/actions/leads";
import { addNote } from "@/app/actions/notes";
import { createTask } from "@/app/actions/tasks";
import { FormularioDeReuniao } from "@/components/reunioes/FormularioDeReuniao";
import { Field } from "@/components/ui/Field";
import { FormFeedback } from "@/components/ui/FormFeedback";
import type { FormState } from "@/lib/guard";

type Panel = "task" | "meeting" | "convert" | "note" | null;

export function LeadActions({
  leadId,
  leadName,
  hasOpenDeal,
  isClosed,
}: {
  leadId: string;
  leadName: string;
  hasOpenDeal: boolean;
  isClosed: boolean;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (next: Panel) => setPanel((current) => (current === next ? null : next));

  return (
    <section className="mt-7 border-t border-line pt-6">
      <h3 className="mb-3 text-xs font-semibold tracking-wider text-muted uppercase">
        Ações
      </h3>

      <div className="flex flex-wrap gap-2">
        <ActionButton active={panel === "task"} onClick={() => toggle("task")} icon={ListPlus}>
          Nova tarefa
        </ActionButton>
        <ActionButton active={panel === "meeting"} onClick={() => toggle("meeting")} icon={CalendarPlus}>
          Agendar reunião
        </ActionButton>
        <ActionButton active={panel === "note"} onClick={() => toggle("note")} icon={StickyNote}>
          Anotação
        </ActionButton>
        {!hasOpenDeal && !isClosed && (
          <ActionButton active={panel === "convert"} onClick={() => toggle("convert")} icon={ArrowRightLeft}>
            Converter em negócio
          </ActionButton>
        )}
        {!isClosed && <LoseButton leadId={leadId} />}
      </div>

      {panel === "task" && <TaskPanel leadId={leadId} onDone={() => setPanel(null)} />}
      {panel === "meeting" && (
        <MeetingPanel leadId={leadId} leadName={leadName} onDone={() => setPanel(null)} />
      )}
      {panel === "note" && <NotePanel leadId={leadId} onDone={() => setPanel(null)} />}
      {panel === "convert" && <ConvertPanel leadId={leadId} onDone={() => setPanel(null)} />}
    </section>
  );
}

function ActionButton({
  children,
  icon: Icon,
  active,
  onClick,
}: {
  children: React.ReactNode;
  icon: React.ElementType;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={`chip border transition ${
        active
          ? "border-waz-50 bg-waz-95 text-waz-20"
          : "border-line bg-surface text-muted hover:text-foreground"
      }`}
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  );
}

/** Fecha o painel depois que a action confirma — efeito, nunca no render. */
function useCloseOnSuccess(ok: boolean | undefined, onDone: () => void) {
  useEffect(() => {
    if (ok) onDone();
  }, [ok, onDone]);
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 rounded-xl border border-line bg-surface-2/50 p-4">{children}</div>;
}

function Submit({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button type="submit" disabled={pending} className="btn-primary mt-1 w-full">
      {pending && <Loader2 className="size-4 animate-spin" />}
      {label}
    </button>
  );
}

function TaskPanel({ leadId, onDone }: { leadId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createTask, null);
  useCloseOnSuccess(state?.ok, onDone);

  return (
    <Panel>
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="leadId" value={leadId} />
        <Field label="Assunto">
          <input name="subject" required placeholder="Follow-up" className="field" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Tipo">
            <select name="type" className="field">
              <option value="follow_up">Follow-up</option>
              <option value="call_individual">Call individual</option>
              <option value="call">Call</option>
              <option value="message">Mensagem</option>
            </select>
          </Field>
          <Field label="Prioridade">
            <select name="priority" defaultValue="MEDIUM" className="field">
              <option value="HIGH">Alta</option>
              <option value="MEDIUM">Média</option>
              <option value="LOW">Baixa</option>
            </select>
          </Field>
          <Field label="Prazo">
            <input name="dueAt" type="datetime-local" className="field" />
          </Field>
        </div>
        <FormFeedback state={state} />
        <Submit pending={pending} label="Criar tarefa" />
      </form>
    </Panel>
  );
}

function MeetingPanel({
  leadId,
  leadName,
  onDone,
}: {
  leadId: string;
  leadName: string;
  onDone: () => void;
}) {
  // O mesmo formulário das outras quatro telas. Havia uma segunda definição
  // aqui, com a própria lista de durações e sem lotação — então uma reunião em
  // grupo criada por esta gaveta nascia invisível para o funil.
  return (
    <Panel>
      <FormularioDeReuniao padrao={{ leadId, leadNome: leadName }} aoConcluir={onDone} />
    </Panel>
  );
}

function NotePanel({ leadId, onDone }: { leadId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addNote, null);
  useCloseOnSuccess(state?.ok, onDone);

  return (
    <Panel>
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="leadId" value={leadId} />
        <Field label="Anotação">
          <textarea name="content" rows={3} required className="field resize-y" />
        </Field>
        <FormFeedback state={state} />
        <Submit pending={pending} label="Salvar anotação" />
      </form>
    </Panel>
  );
}

function ConvertPanel({ leadId, onDone }: { leadId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(convertLead, null);
  useCloseOnSuccess(state?.ok, onDone);

  return (
    <Panel>
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="leadId" value={leadId} />
        <p className="text-xs text-muted">
          Cria o negócio na primeira etapa do pipeline e marca o lead como convertido.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor (R$)">
            <input name="value" inputMode="decimal" placeholder="45.360,00" className="field" />
          </Field>
          <Field label="Produto">
            <select name="product" className="field">
              <option value="">Selecione…</option>
              <option value="Starter">Starter</option>
              <option value="Pro">Pro</option>
              <option value="Enterprise">Enterprise</option>
            </select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Previsão de fechamento">
            <input name="expectedAt" type="date" className="field" />
          </Field>
          <Field label="Probabilidade">
            <select name="probability" defaultValue="20" className="field">
              {[20, 40, 60, 80].map((p) => (
                <option key={p} value={p}>{p}%</option>
              ))}
            </select>
          </Field>
        </div>
        <FormFeedback state={state} />
        <Submit pending={pending} label="Converter em negócio" />
      </form>
    </Panel>
  );
}

function LoseButton({ leadId }: { leadId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="chip border border-line bg-surface text-muted transition hover:border-red-200 hover:text-red-700"
      >
        <XCircle className="size-3.5" />
        Marcar perdido
      </button>
    );
  }

  return (
    <form action={markLeadLost} className="flex w-full items-end gap-2">
      <input type="hidden" name="id" value={leadId} />
      <div className="flex-1">
        <Field label="Motivo da perda">
          <input name="reason" placeholder="Sem orçamento, timing…" className="field" />
        </Field>
      </div>
      <button type="submit" className="btn bg-red-600 text-white hover:bg-red-700">
        Confirmar
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="btn-ghost">
        Cancelar
      </button>
    </form>
  );
}
