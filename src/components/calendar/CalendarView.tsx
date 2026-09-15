import Link from "next/link";
import { ChevronLeft, ChevronRight, Video } from "lucide-react";

import { PageHeader } from "@/components/shell/PageHeader";
import { diaCivil, hhmm, horaLocal, isSameDay, TZ, WEEK_DAYS, weekDays } from "@/lib/dates";
import type { Space } from "@/lib/nav";

type Meeting = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  type: "GROUP" | "ONE_ON_ONE";
  status: "SCHEDULED" | "DONE" | "NO_SHOW" | "CANCELED";
  lead: { id: string; name: string; company: string | null; score: string | null } | null;
  owner: { id: string; name: string };
};

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 07:00 → 21:00

const STATUS_STYLE: Record<Meeting["status"], string> = {
  SCHEDULED: "border-waz-70 bg-waz-95 text-waz-10 hover:bg-waz-90",
  DONE: "border-line bg-surface-2 text-muted",
  NO_SHOW: "border-red-200 bg-red-50 text-red-700",
  CANCELED: "border-line bg-surface-2 text-muted line-through",
};

export function CalendarView({
  space,
  meetings,
  start,
  offset,
  showOwner,
}: {
  space: Space;
  meetings: Meeting[];
  start: Date;
  offset: number;
  showOwner: boolean;
}) {
  const days = weekDays(start);
  const today = new Date();

  const label = `${days[0].toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "short" })} – ${days[6].toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" })}`;

  return (
    <>
      <PageHeader
        title="Calendário"
        subtitle={`${meetings.length} ${meetings.length === 1 ? "reunião" : "reuniões"} nesta semana`}
        actions={
          <div className="flex items-center gap-1.5">
            <Link
              href={`/${space}/calendar?w=${offset - 1}`}
              aria-label="Semana anterior"
              className="btn-ghost px-2.5"
            >
              <ChevronLeft className="size-4" />
            </Link>
            <Link href={`/${space}/calendar`} className="btn-ghost min-w-[188px] font-mono text-xs">
              {label}
            </Link>
            <Link
              href={`/${space}/calendar?w=${offset + 1}`}
              aria-label="Próxima semana"
              className="btn-ghost px-2.5"
            >
              <ChevronRight className="size-4" />
            </Link>
          </div>
        }
      />

      <div className="card overflow-hidden">
        <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-line">
          <div className="border-r border-line px-2 py-3 text-center text-[11px] font-semibold text-muted">
            Hora
          </div>
          {days.map((day, i) => {
            const isToday = isSameDay(day, today);
            return (
              <div
                key={day.toISOString()}
                className={`border-r border-line px-2 py-3 text-center last:border-r-0 ${isToday ? "bg-waz-95" : ""}`}
              >
                <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">
                  {WEEK_DAYS[i]}
                </p>
                <p
                  className={`mx-auto mt-1 grid size-7 place-items-center rounded-full text-sm font-semibold ${
                    isToday ? "bg-waz-30 text-white" : ""
                  }`}
                >
                  {diaCivil(day).dia}
                </p>
              </div>
            );
          })}
        </div>

        <div className="max-h-[calc(100dvh-260px)] overflow-y-auto">
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="grid min-h-[72px] grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-line last:border-b-0"
            >
              <div className="border-r border-line px-2 pt-2 text-center text-[11px] font-medium text-muted">
                {String(hour).padStart(2, "0")}:00
              </div>

              {days.map((day) => {
                // `horaLocal` e não `getHours()`: este componente é renderizado
                // no servidor, e na Vercel o relógio é UTC — uma reunião das
                // 10:00 caía na linha das 13:00 para o time inteiro.
                const slot = meetings.filter(
                  (m) => isSameDay(m.startsAt, day) && horaLocal(m.startsAt) === hour,
                );
                const isToday = isSameDay(day, today);

                return (
                  <div
                    key={`${day.toISOString()}-${hour}`}
                    className={`space-y-1 border-r border-line p-1.5 last:border-r-0 ${isToday ? "bg-waz-95/40" : ""}`}
                  >
                    {slot.map((meeting) => (
                      <article
                        key={meeting.id}
                        className={`rounded-lg border px-2 py-1.5 text-left transition ${STATUS_STYLE[meeting.status]}`}
                      >
                        <p className="flex items-center gap-1 text-[11px] font-semibold">
                          {meeting.type === "GROUP" && <Video className="size-3 shrink-0" />}
                          {hhmm(meeting.startsAt)}
                        </p>
                        <p className="truncate text-xs font-medium">
                          {meeting.lead?.name ?? meeting.title}
                        </p>
                        {showOwner && (
                          <p className="truncate text-[10px] opacity-70">
                            {meeting.owner.name}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
