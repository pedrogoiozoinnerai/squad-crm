import Link from "next/link";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Users, Video } from "lucide-react";

import { setMeetingStatus } from "@/app/actions/meetings";
import { LinkDaSala } from "@/components/sala/LinkDaSala";
import { toggleTask } from "@/app/actions/tasks";
import { PageHeader } from "@/components/shell/PageHeader";
import { NovaReuniao } from "@/components/reunioes/NovaReuniao";
import { TZ, chaveDoDia, hhmm, horaLocal, paraCampoLocal } from "@/lib/dates";

type Meeting = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  type: "GROUP" | "ONE_ON_ONE";
  status: "SCHEDULED" | "DONE" | "NO_SHOW" | "CANCELED";
  lead: { name: string; company: string | null } | null;
  attendees: { inviteToken: string }[];
  presences: { identity: string; seconds: number }[];
};

type Task = {
  id: string;
  subject: string;
  status: "PENDING" | "DONE" | "CANCELED";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueAt: Date | null;
  lead: { name: string } | null;
};

const MEETING_STATUS = {
  SCHEDULED: { text: "Agendada", tone: "bg-sky-50 text-sky-700" },
  DONE: { text: "Realizada", tone: "bg-waz-90 text-waz-20" },
  NO_SHOW: { text: "Não compareceu", tone: "bg-red-50 text-red-700" },
  CANCELED: { text: "Cancelada", tone: "bg-surface-2 text-muted" },
} as const;

export function AgendaView({
  meetings,
  tasks,
  day,
  offset,
  basePath,
  now,
  owners,
}: {
  meetings: Meeting[];
  tasks: Task[];
  day: Date;
  offset: number;
  basePath: string;
  now: Date;
  owners?: { id: string; name: string }[];
}) {
  const doneTasks = tasks.filter((task) => task.status === "DONE").length;
  const total = meetings.length + tasks.length;
  const progress = total === 0 ? 0 : Math.round(((doneTasks + meetings.filter((m) => m.status === "DONE").length) / total) * 100);

  const label = day.toLocaleDateString("pt-BR", { timeZone: TZ,
    weekday: "long", day: "2-digit", month: "long",
  });

  return (
    <>
      <PageHeader
        title="Minha agenda"
        subtitle={`${meetings.length} ${meetings.length === 1 ? "reunião" : "reuniões"} · ${tasks.length} ${tasks.length === 1 ? "tarefa" : "tarefas"}`}
        actions={
          <div className="flex items-center gap-1.5">
            <Link href={`${basePath}?d=${offset - 1}`} aria-label="Dia anterior" className="btn-ghost px-2.5">
              <ChevronLeft className="size-4" />
            </Link>
            <Link href={basePath} className="btn-ghost min-w-[200px] text-xs capitalize">
              {label}
            </Link>
            <Link href={`${basePath}?d=${offset + 1}`} aria-label="Próximo dia" className="btn-ghost px-2.5">
              <ChevronRight className="size-4" />
            </Link>
            {/* Já no dia que está na tela: quem está olhando quinta-feira quer
                marcar na quinta, não em hoje. */}
            <NovaReuniao
              padrao={{ inicioEm: proximaHoraCheia(day, now) }}
              owners={owners}
            />
          </div>
        }
      />

      <div className="card mb-5 px-5 py-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">Progresso do dia</span>
          <span className="text-muted">{progress}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-waz-50 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Video className="size-4 text-muted" />
            Reuniões
          </h2>

          {meetings.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-10 text-center text-xs text-muted">
              Dia livre de reuniões.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {meetings.map((meeting) => {
                const live = meeting.startsAt <= now && meeting.endsAt >= now;
                const status = MEETING_STATUS[meeting.status];

                return (
                  <li key={meeting.id} className="rounded-xl bg-surface-2/60 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-semibold">
                          <Clock className="size-3.5 text-muted" />
                          {hhmm(meeting.startsAt)} – {hhmm(meeting.endsAt)}
                          {live && (
                            <span className="chip bg-waz-50 text-white">● Ao vivo</span>
                          )}
                        </p>
                        <p className="mt-1 truncate text-sm">
                          {meeting.lead?.name ?? meeting.title}
                        </p>
                        {meeting.lead?.company && (
                          <p className="truncate text-xs text-muted">{meeting.lead.company}</p>
                        )}
                      </div>
                      <span className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className={`chip ${status.tone}`}>{status.text}</span>
                        {meeting.type === "GROUP" && (
                          <span className="chip bg-surface text-muted ring-1 ring-line">
                            <Users className="size-3" />
                            Grupo
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Entrar aparece na janela da sala, não o dia inteiro:
                        um botão que leva a "ainda não abriu" é pior que
                        nenhum. Meia hora antes é quando o vendedor começa a
                        se preparar. */}
                    {meeting.status === "SCHEDULED" &&
                      meeting.endsAt >= now &&
                      meeting.startsAt.getTime() - now.getTime() <= 30 * 60_000 && (
                        <div className="mt-2.5">
                          <LinkDaSala
                            meetingId={meeting.id}
                            convite={meeting.attendees[0]?.inviteToken ?? null}
                            compacto
                          />
                        </div>
                      )}

                    {presentes(meeting) && (
                      <p className="mt-2.5 text-xs text-muted">
                        <strong className="font-semibold text-foreground">
                          {presentes(meeting)}
                        </strong>{" "}
                        na sala, medido pela própria call
                      </p>
                    )}

                    {meeting.status === "SCHEDULED" && (
                      <div className="mt-2.5 flex gap-1.5">
                        {(["DONE", "NO_SHOW", "CANCELED"] as const).map((next) => (
                          <form key={next} action={setMeetingStatus}>
                            <input type="hidden" name="id" value={meeting.id} />
                            <input type="hidden" name="status" value={next} />
                            <button
                              type="submit"
                              className="chip border border-line bg-surface text-muted transition hover:text-foreground"
                            >
                              {MEETING_STATUS[next].text}
                            </button>
                          </form>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="size-4 text-muted" />
            Tarefas com prazo hoje
          </h2>

          {tasks.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-10 text-center text-xs text-muted">
              Nenhuma tarefa vence neste dia.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {tasks.map((task) => {
                const done = task.status === "DONE";

                return (
                  <li
                    key={task.id}
                    className={`flex items-center gap-3 rounded-xl bg-surface-2/60 p-3 ${done ? "opacity-55" : ""}`}
                  >
                    <form action={toggleTask}>
                      <input type="hidden" name="taskId" value={task.id} />
                      <button
                        type="submit"
                        aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
                        className={`grid size-6 place-items-center rounded-full border transition ${
                          done
                            ? "border-waz-50 bg-waz-50 text-white"
                            : "border-line text-transparent hover:border-waz-50"
                        }`}
                      >
                        <CheckCircle2 className="size-3.5" />
                      </button>
                    </form>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-medium ${done ? "line-through" : ""}`}>
                        {task.subject}
                      </span>
                      {task.lead && (
                        <span className="block truncate text-xs text-muted">{task.lead.name}</span>
                      )}
                    </span>
                    {task.dueAt && (
                      <span className="shrink-0 text-xs text-muted">{hhmm(task.dueAt)}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

/**
 * O campo de início já preenchido, na próxima hora cheia.
 *
 * No dia de hoje, a próxima hora que ainda não passou; em qualquer outro dia,
 * nove da manhã. Um campo vazio obriga a digitar data e hora inteiras toda
 * vez, e um campo em "agora" propõe uma reunião que começa neste minuto.
 */
function proximaHoraCheia(dia: Date, agora: Date) {
  const hoje = chaveDoDia(dia) === chaveDoDia(agora);
  const hora = hoje ? Math.min(horaLocal(agora) + 1, 23) : 9;
  return `${chaveDoDia(dia)}T${String(hora).padStart(2, "0")}:00`;
}

/**
 * Quanto tempo o LEAD ficou na sala.
 *
 * Só o lead: o vendedor estar na própria reunião não é informação. As
 * identidades vêm prefixadas (`l_` para lead) justamente para separar isso sem
 * consultar o banco.
 */
function presentes(meeting: { presences: { identity: string; seconds: number }[] }) {
  const segundos = meeting.presences
    .filter((p) => p.identity.startsWith("l_"))
    .reduce((t, p) => t + p.seconds, 0);
  if (segundos <= 0) return null;
  const min = Math.round(segundos / 60);
  return min < 1 ? "menos de 1 min" : `${min} min`;
}
