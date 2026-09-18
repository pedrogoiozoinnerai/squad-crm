import Link from "next/link";
import { CheckCheck, ChevronLeft, ChevronRight, Layers, Users, Video } from "lucide-react";

import { NovaReuniaoNaCelula } from "@/components/reunioes/NovaReuniaoNaCelula";
import { PageHeader } from "@/components/shell/PageHeader";
import { chaveDoDia, diaCivil, horaLocal, isSameDay, TZ, WEEK_DAYS, weekDays } from "@/lib/dates";
import { corDoCloser, type Space } from "@/lib/nav";
import { situacaoDaSessao } from "@/lib/presenca";

type Meeting = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  type: "GROUP" | "ONE_ON_ONE";
  status: "SCHEDULED" | "DONE" | "NO_SHOW" | "CANCELED";
  lead: { id: string; name: string; company: string | null; score: string | null } | null;
  owner: { id: string; name: string };
  /// Quantos marcaram com este closer neste horário.
  inscritos: number;
  /// Quantos apareceram de verdade — medido pela sala, não marcado à mão.
  presentes: number;
  temGravacao: boolean;
};

/// Quantos cartões cabem numa célula antes de virar "+N salas".
///
/// Dois. Com cinco closers no mesmo horário, empilhar todos faz a linha das
/// 10:00 ter cinco vezes a altura das outras e a grade deixa de ser lida como
/// grade. É o mesmo recolhimento que a referência usa.
const POR_CELULA = 2;

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 07:00 → 21:00

/** "seg, 06/10" — o que o botão de marcar anuncia para leitor de tela. */
function dia(d: Date) {
  return d.toLocaleDateString("pt-BR", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

export function CalendarView({
  space,
  meetings,
  start,
  offset,
  owners,
  agora,
}: {
  space: Space;
  meetings: Meeting[];
  start: Date;
  offset: number;
  /// O relógio vem da página, como nas outras telas. O componente criava o
  /// próprio `new Date()` enquanto a página já criava outro para o `weekStart`:
  /// dois relógios na mesma renderização.
  agora: Date;
  owners?: { id: string; name: string }[];
}) {
  const days = weekDays(start);
  const today = agora;

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

      {/* A grade rola de lado em vez de espremer.
          Com sete colunas numa janela estreita cada cartão fica com ~78px, e o
          nome do closer — que é o EIXO desta tela — trunca para "Mi…". Largura
          mínima e rolagem horizontal preservam a informação; espremer a
          destrói. */}
      <div className="card overflow-x-auto">
        <div className="min-w-[1000px]">
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
                    className={`group/celula relative space-y-1 border-r border-line p-1.5 last:border-r-0 ${isToday ? "bg-waz-95/40" : ""}`}
                  >
                    {/* Marcar clicando na grade: o dia e a hora já vêm da
                        célula, que é a informação que o formulário pediria
                        primeiro. Só aparece no hover para não competir com as
                        reuniões que estão ali. */}
                    <NovaReuniaoNaCelula
                      inicioEm={`${chaveDoDia(day)}T${String(hour).padStart(2, "0")}:00`}
                      rotuloDoHorario={`${dia(day)} às ${String(hour).padStart(2, "0")}:00`}
                      owners={owners}
                    />

                    {slot.slice(0, POR_CELULA).map((meeting) => (
                      <Cartao key={meeting.id} reuniao={meeting} agora={today} space={space} />
                    ))}

                    {/* O resto recolhido, como na referência: a grade continua
                        legível e o número diz que há mais ali. */}
                    {slot.length > POR_CELULA && (
                      <Link
                        href={`/${space}/sessoes`}
                        className="relative z-10 flex items-center gap-1 rounded-lg border border-dashed border-line px-2 py-1 text-[10px] text-muted transition hover:bg-surface-2"
                      >
                        <Layers className="size-3 shrink-0" />
                        +{slot.length - POR_CELULA}{" "}
                        {slot.length - POR_CELULA === 1 ? "sala" : "salas"}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        </div>
      </div>
    </>
  );
}

/**
 * Um cartão da grade: quem conduz, quantos marcaram e quantos vieram.
 *
 * A mudança em relação ao que havia antes é o que o cartão RESPONDE. Ele
 * mostrava o nome do lead e o horário — informação que a própria célula já dá.
 * Agora mostra o closer e os dois números que o gestor procura ao bater o olho
 * na semana: **agendados** e **realizados**.
 *
 * Os realizados só aparecem depois que a sessão terminou. Antes disso o número
 * seria zero e a grade acusaria o closer por uma call que ainda nem começou —
 * é a mesma regra da tela de Sessões, e ela mora em `lib/presenca`.
 */
function Cartao({
  reuniao,
  agora,
  space,
}: {
  reuniao: Meeting;
  agora: Date;
  space: Space;
}) {
  const cor = corDoCloser(reuniao.owner.id);
  const situacao = situacaoDaSessao(reuniao, agora);
  const medida = situacao === "medida";
  const coletiva = reuniao.type === "GROUP";

  return (
    <Link
      href={coletiva ? `/${space}/sessoes/${reuniao.id}` : `/${space}/leads?lead=${reuniao.lead?.id ?? ""}`}
      className={`relative z-10 block rounded-lg border px-2 py-1.5 text-left transition hover:brightness-95 ${cor.fundo} ${cor.borda}`}
    >
      <p className="flex items-center gap-1.5">
        <span className={`size-1.5 shrink-0 rounded-full ${cor.ponto}`} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">
          {reuniao.owner.name}
        </span>
        {reuniao.temGravacao && (
          <Video className="size-3 shrink-0 text-muted" aria-label="tem gravação" />
        )}
      </p>

      <p className="mt-0.5 flex items-center gap-2 text-[10px] text-muted tabular-nums">
        <span className="flex items-center gap-0.5" title={`${reuniao.inscritos} agendados`}>
          <Users className="size-3 shrink-0" />
          {reuniao.inscritos}
        </span>
        <span
          className="flex items-center gap-0.5"
          title={medida ? `${reuniao.presentes} realizados` : "ainda não aconteceu"}
        >
          <CheckCheck className="size-3 shrink-0" />
          {medida ? reuniao.presentes : "—"}
        </span>
        {!coletiva && reuniao.lead && (
          <span className="min-w-0 flex-1 truncate">{reuniao.lead.name}</span>
        )}
      </p>
    </Link>
  );
}
