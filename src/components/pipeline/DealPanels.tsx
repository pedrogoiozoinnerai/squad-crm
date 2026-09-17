"use client";

import { useActionState, useEffect, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  History,
  Loader2,
  MessageCircle,
  Sparkles,
  Trash2,
} from "lucide-react";

import { deleteTask, toggleTask } from "@/app/actions/tasks";
import { addNote } from "@/app/actions/notes";
import { createTask } from "@/app/actions/tasks";
import { FormularioDeReuniao } from "@/components/reunioes/FormularioDeReuniao";
import { Field } from "@/components/ui/Field";
import { Acao } from "@/components/ui/Acao";
import { FormFeedback } from "@/components/ui/FormFeedback";
import type { FormState } from "@/lib/guard";
import { linkWhatsapp } from "@/lib/mensagem";
import { isSameDay, TZ} from "@/lib/dates";

export type PanelTask = {
  id: string;
  subject: string;
  description: string | null;
  type: string;
  status: "PENDING" | "DONE" | "CANCELED";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueAt: Date | null;
  createdAt: Date;
};

export type PanelActivity = {
  id: string;
  title: string;
  detail: string | null;
  createdAt: Date;
  author: { name: string } | null;
};

export type PanelCase = {
  id: string;
  title: string;
  client: string;
  segment: string;
  highlight: string;
  metric: string;
  summary: string;
  link: string | null;
  exact: boolean;
};

type Tab = "task" | "meeting" | "note" | "activities" | "chat" | "cases";

const TABS: { key: Tab; label: string }[] = [
  { key: "task", label: "Nova Tarefa" },
  { key: "meeting", label: "Nova Reunião" },
  { key: "note", label: "Anotação" },
  { key: "activities", label: "Atividades" },
  { key: "chat", label: "WhatsApp" },
  { key: "cases", label: "Cases" },
];

// "Chat Nina" e "Plano de Ação" saíram: as duas abas existiam para mostrar um
// texto explicando que não existiam. Aba vazia não é promessa de roadmap, é
// clique desperdiçado toda vez que alguém a tenta. Voltam quando houver o quê
// mostrar. "Chat" virou "WhatsApp" porque é o que o botão de fato faz.

const PRIORITY_LABEL = { HIGH: "ALTA", MEDIUM: "MÉDIA", LOW: "BAIXA" } as const;

export function DealPanels({
  dealId,
  leadId,
  leadName,
  leadPhone,
  leadSegment,
  tasks,
  activities,
  cases,
  agora,
}: {
  dealId: string;
  leadId: string;
  leadName: string;
  leadPhone: string | null;
  leadSegment: string | null;
  tasks: PanelTask[];
  activities: PanelActivity[];
  cases: PanelCase[];
  /// O relógio vem de fora. Componente que chama `new Date()` no corpo produz
  /// um instante no servidor e outro na hidratação — foi o que fazia "Hoje"
  /// piscar entre 21h e meia-noite.
  agora: Date;
}) {
  const [tab, setTab] = useState<Tab>("activities");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line pb-3">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            aria-current={tab === item.key ? "true" : undefined}
            className={`chip border transition ${
              tab === item.key
                ? "border-waz-50 bg-waz-95 text-waz-20"
                : "border-transparent text-muted hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pt-4">
        {tab === "task" && <TaskForm dealId={dealId} leadId={leadId} onDone={() => setTab("activities")} />}
        {/* O formulário fica AQUI e não no `DealSidePanel`: aquele é ele
            próprio um <form>, e <form> aninhado é HTML inválido — o React não
            renderiza. Esta coluna já hospeda tarefa e anotação do mesmo jeito. */}
        {tab === "meeting" && (
          <FormularioDeReuniao
            padrao={{ dealId, leadId, leadNome: leadName }}
            aoConcluir={() => setTab("activities")}
          />
        )}
        {tab === "note" && <NoteForm dealId={dealId} leadId={leadId} onDone={() => setTab("activities")} />}
        {tab === "activities" && <Activities tasks={tasks} activities={activities} agora={agora} />}
        {tab === "chat" && <ChatEmpty leadName={leadName} leadPhone={leadPhone} />}
        {tab === "cases" && <Cases cases={cases} segment={leadSegment} />}
      </div>
    </div>
  );
}

function useCloseOnSuccess(ok: boolean | undefined, onDone: () => void) {
  useEffect(() => {
    if (ok) onDone();
  }, [ok, onDone]);
}

function TaskForm({ dealId, leadId, onDone }: { dealId: string; leadId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createTask, null);
  useCloseOnSuccess(state?.ok, onDone);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="leadId" value={leadId} />
      <Field label="Assunto">
        <input name="subject" required placeholder="Follow-up" className="field" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Tipo">
          <select name="type" className="field">
            <option value="follow_up">Follow-up</option>
            <option value="call_individual">Call individual</option>
            <option value="call">Call coletiva</option>
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
      <button type="submit" disabled={pending} className="btn-primary self-start">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Criar tarefa
      </button>
    </form>
  );
}

function NoteForm({ dealId, leadId, onDone }: { dealId: string; leadId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addNote, null);
  useCloseOnSuccess(state?.ok, onDone);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="leadId" value={leadId} />
      <Field label="Anotação">
        <textarea name="content" rows={5} required className="field resize-y" />
      </Field>
      <FormFeedback state={state} />
      <button type="submit" disabled={pending} className="btn-primary self-start">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Salvar anotação
      </button>
    </form>
  );
}

type Filter = "all" | "tasks" | "history";

function Activities({
  tasks,
  activities,
  agora,
}: {
  tasks: PanelTask[];
  activities: PanelActivity[];
  agora: Date;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const showTasks = filter === "all" || filter === "tasks";
  const showHistory = filter === "all" || filter === "history";

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "Tudo", count: tasks.length + activities.length },
    { key: "tasks", label: "Tarefas", count: tasks.length },
    { key: "history", label: "Histórico", count: activities.length },
  ];

  const empty = (showTasks ? tasks.length : 0) + (showHistory ? activities.length : 0) === 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={`chip border transition ${
              filter === item.key
                ? "border-waz-50 bg-waz-95 text-waz-20"
                : "border-line bg-surface text-muted hover:text-foreground"
            }`}
          >
            {item.key === "tasks" && <ClipboardList className="size-3" />}
            {item.key === "history" && <History className="size-3" />}
            {item.label} ({item.count})
          </button>
        ))}
      </div>

      {empty && (
        <p className="rounded-xl border border-dashed border-line px-3 py-10 text-center text-xs text-muted">
          Nada registrado ainda.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {showTasks &&
          tasks.map((task) => <TaskRow key={task.id} task={task} agora={agora} />)}

        {showHistory &&
          activities.map((activity) => (
            <article key={activity.id} className="flex gap-3">
              <div className="w-[54px] shrink-0 pt-0.5 text-right">
                <p className="font-mono text-xs font-semibold">
                  {activity.createdAt.toLocaleTimeString("pt-BR", { timeZone: TZ,
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <p className="text-[10px] tracking-wider text-muted uppercase">
                  {relativeDay(activity.createdAt, agora)}
                </p>
              </div>
              <div className="min-w-0 flex-1 border-l border-line pb-3 pl-4">
                <p className="text-sm font-medium">{activity.title}</p>
                {activity.detail && (
                  <p className="mt-0.5 text-xs text-muted">{activity.detail}</p>
                )}
                {activity.author && (
                  <p className="mt-1 text-[11px] text-muted">{activity.author.name}</p>
                )}
              </div>
            </article>
          ))}
      </div>
    </>
  );
}

function TaskRow({ task, agora }: { task: PanelTask; agora: Date }) {
  const done = task.status === "DONE";

  return (
    <article className={`flex gap-3 ${done ? "opacity-55" : ""}`}>
      <div className="w-[54px] shrink-0 pt-0.5 text-right">
        <p className="font-mono text-xs font-semibold">
          {task.createdAt.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })}
        </p>
        <p className="text-[10px] tracking-wider text-muted uppercase">
          {relativeDay(task.createdAt, agora)}
        </p>
      </div>

      <div className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2/40 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${done ? "line-through" : ""}`}>{task.subject}</p>
            {task.description && (
              <p className="mt-0.5 text-xs whitespace-pre-line text-muted">{task.description}</p>
            )}
            {task.dueAt && (
              <p className="mt-0.5 text-xs text-muted">
                vence{" "}
                {task.dueAt.toLocaleString("pt-BR", { timeZone: TZ,
                  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                })}
              </p>
            )}
          </div>
          <span className="shrink-0 text-[10px] font-semibold tracking-wider text-muted uppercase">
            — {done ? "Feito" : "A fazer"} · {PRIORITY_LABEL[task.priority]}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
          <Acao action={toggleTask} mensagem="Não deu para mudar a tarefa.">
            <input type="hidden" name="taskId" value={task.id} />
            <button type="submit" className="chip text-muted transition hover:text-waz-20">
              <CheckCircle2 className="size-3" />
              {done ? "Reabrir" : "Concluir"}
            </button>
          </Acao>
          <Acao action={deleteTask} mensagem="Não deu para excluir a tarefa.">
            <input type="hidden" name="taskId" value={task.id} />
            <button type="submit" className="chip text-red-700 transition hover:bg-red-50">
              <Trash2 className="size-3" />
              Excluir
            </button>
          </Acao>
        </div>
      </div>
    </article>
  );
}

function relativeDay(date: Date, agora: Date) {
  // `isSameDay` compara pelo dia civil de São Paulo. Com `getDate()` a mesma
  // função misturava dois fusos — o do servidor no primeiro render e o do
  // navegador na hidratação —, e entre 21h e meia-noite o texto "Hoje" piscava
  // com o React acusando mismatch. O `agora` vem por prop, como o resto do
  // arquivo já faz: componente não lê o relógio.
  if (isSameDay(date, agora)) return "Hoje";
  return date.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
}

function ChatEmpty({ leadName, leadPhone }: { leadName: string; leadPhone: string | null }) {
  return (
    <div className="grid place-items-center py-16 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-surface-2 text-muted">
        <MessageCircle className="size-6" />
      </span>
      <p className="mt-4 text-base font-semibold">Nenhuma conversa ativa</p>
      <p className="mt-1 text-sm text-muted">{leadName}</p>
      {leadPhone && <p className="font-mono text-sm text-muted">{leadPhone}</p>}
      {leadPhone ? (
        <a
          href={linkWhatsapp(leadPhone) ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="btn-ghost mt-5"
        >
          <MessageCircle className="size-4" />
          Iniciar Conversa via WhatsApp
        </a>
      ) : (
        <p className="mt-5 text-xs text-muted">Cadastre um telefone para abrir a conversa.</p>
      )}
    </div>
  );
}

function Cases({ cases, segment }: { cases: PanelCase[]; segment: string | null }) {
  const [query, setQuery] = useState("");

  const filtered = cases.filter((item) =>
    `${item.title} ${item.client} ${item.segment}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <>
      <div className="mb-4">
        <p className="text-sm font-semibold">Cases relevantes</p>
        <p className="text-xs text-muted">
          {cases.filter((c) => c.exact).length} match(es) pro setor{" "}
          <strong className="text-foreground">{segment ?? "não informado"}</strong>
        </p>
      </div>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar por título, cliente, setor…"
        className="field mb-3"
      />

      <div className="flex flex-col gap-2">
        {filtered.length === 0 && (
          <p className="rounded-xl border border-dashed border-line px-3 py-10 text-center text-xs text-muted">
            Nenhum case encontrado.
          </p>
        )}

        {filtered.map((item) => (
          <article key={item.id} className="rounded-xl border border-line bg-surface-2/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                  {item.client}
                  <span className="chip bg-surface ring-1 ring-line">{item.segment}</span>
                </p>
              </div>
              {item.exact && (
                <span className="chip shrink-0 bg-waz-95 text-[10px] tracking-wider text-waz-20 uppercase">
                  Match exato
                </span>
              )}
            </div>

            <p className="mt-2 flex items-center gap-1.5 text-sm">
              <Sparkles className="size-3.5 text-waz-40" />
              <strong>{item.highlight}</strong>
              <span className="text-muted">{item.metric}</span>
            </p>

            <p className="mt-1.5 text-xs text-muted">{item.summary}</p>

            {item.link && (
              <a
                href={item.link}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-xs font-semibold text-waz-30 underline-offset-4 hover:underline"
              >
                Ver case
              </a>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
