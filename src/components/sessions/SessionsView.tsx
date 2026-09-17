import Link from "next/link";
import { ChevronLeft, ChevronRight, Sparkles, Timer, UserCheck, Users } from "lucide-react";

import { NovaReuniao } from "@/components/reunioes/NovaReuniao";
import { PageHeader } from "@/components/shell/PageHeader";
import { TZ, chaveDoDia, hhmm, isSameDay, weekDays } from "@/lib/dates";
import { situacaoDaSessao, totaisDoPeriodo } from "@/lib/presenca";
import type { Space } from "@/lib/nav";

/** Meta de presença do time — vira a cor da barra. */
const META_PRESENCA = 60;

export type SessionRow = {
  id: string;
  /// Um instante, não mais dia + "HH:MM": a sessão coletiva virou uma reunião
  /// como qualquer outra, e o horário deixou de depender do fuso do servidor.
  startsAt: Date;
  endsAt: Date;
  capacity: number | null;
  status: "SCHEDULED" | "DONE" | "NO_SHOW" | "CANCELED";
  template: { name: string } | null;
  title: string;
  owner: { id: string; name: string };
  inscritos: number;
  presentes: number;
  taxaPresenca: number;
  qualificados: number;
};

/** Teto do `?w=`: uma semana por vez, mas sem passear por séculos. */
const MAX_SEMANAS = 260;

/**
 * Semana pedida na URL, saneada. `?w=1e999` virava `Infinity`, o início da
 * semana virava `Invalid Date` e a página inteira caía na query do Prisma;
 * `?w=1.5` deslocava o recorte para fora da segunda-feira sem avisar ninguém.
 */
export function parseWeekOffset(value: string | string[] | undefined) {
  const bruto = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isFinite(bruto)) return 0;
  return Math.max(-MAX_SEMANAS, Math.min(MAX_SEMANAS, Math.trunc(bruto)));
}

/** "32 min" — o tempo medido na sala, do jeito que o closer lê. */
export function tempoNaSala(totalSeconds: number) {
  if (totalSeconds <= 0) return "não entrou";
  if (totalSeconds < 60) return "menos de 1 min";

  const min = Math.round(totalSeconds / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

export function SessionsView({
  space,
  sessions,
  start,
  offset,
  now,
  minutosMinimos,
  owners,
}: {
  space: Space;
  sessions: SessionRow[];
  start: Date;
  offset: number;
  now: Date;
  /// A regra vem do banco (`Config.presencaMinutos`), não de uma constante
  /// aqui: ela é editável no painel, e três cópias divergentes foi o que
  /// tínhamos antes.
  minutosMinimos: number;
  owners?: { id: string; name: string }[];
}) {
  const base = `/${space}/sessoes`;
  const days = weekDays(start);

  const label = `${days[0].toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "short" })} – ${days[6].toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" })}`;

  // Sessão que ainda não aconteceu não tem tempo de sala medido: entraria com
  // 0% e derrubaria a média da semana inteira. Só o que já rodou vira taxa —
  // e "rodou" é a sala fechada, não começada: durante a call o tempo de quem
  // está lá dentro ainda está correndo. A regra mora em `lib/presenca`.
  const totais = totaisDoPeriodo(sessions, now);
  const inscritos = sessions.reduce((soma, s) => soma + s.inscritos, 0);

  return (
    <>
      <PageHeader
        title="Sessões"
        subtitle={`${sessions.length} ${sessions.length === 1 ? "sessão coletiva" : "sessões coletivas"} nesta semana`}
        actions={
          <div className="flex items-center gap-1.5">
            <Link
              href={`${base}?w=${offset - 1}`}
              aria-label="Semana anterior"
              className="btn-ghost px-2.5"
            >
              <ChevronLeft className="size-4" />
            </Link>
            <Link href={base} className="btn-ghost min-w-[188px] font-mono text-xs">
              {label}
            </Link>
            <Link
              href={`${base}?w=${offset + 1}`}
              aria-label="Próxima semana"
              className="btn-ghost px-2.5"
            >
              <ChevronRight className="size-4" />
            </Link>
            {/* Sessão avulsa: a série cobre o recorrente, mas uma turma extra
                não deveria exigir criar uma regra recorrente para ela. Já
                nasce em GRUPO e com lotação — sem lotação a sessão não
                apareceria no funil. */}
            <NovaReuniao
              rotulo="Nova sessão"
              padrao={{
                inicioEm: `${chaveDoDia(days[0])}T10:00`,
                tipo: "GROUP",
                capacidade: 20,
                duracaoMin: 45,
              }}
              owners={owners}
            />
          </div>
        }
      />

      {/* ── Métricas da semana ───────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Sessões na semana"
          value={String(sessions.length)}
          hint={`${totais.realizadas} ${totais.realizadas === 1 ? "já realizada" : "já realizadas"}`}
          icon={Users}
        />
        <Metric
          label="Inscritos"
          value={String(inscritos)}
          hint="Somando todas as sessões da semana"
          icon={UserCheck}
        />
        <Metric
          label="Taxa média de presença"
          value={totais.inscritosRealizados ? `${totais.taxa}%` : "—"}
          hint={
            totais.inscritosRealizados
              ? `${totais.presentes} de ${totais.inscritosRealizados} inscritos ficaram ${minutosMinimos} min ou mais na sala`
              : "Nenhuma sessão desta semana terminou ainda"
          }
          icon={Timer}
          tone={
            totais.inscritosRealizados === 0
              ? undefined
              : totais.taxa >= META_PRESENCA
                ? "positivo"
                : "negativo"
          }
        />
        <Metric
          label="Leads qualificados (A/B)"
          value={String(totais.qualificados)}
          hint="Entre quem esteve presente"
          icon={Sparkles}
        />
      </div>

      {/* O porquê desta tela: presença é medida, não declarada. */}
      <p className="mt-4 flex items-start gap-2.5 rounded-2xl border border-waz-80 bg-waz-95 px-4 py-3 text-xs leading-relaxed text-waz-20">
        <Timer className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong>Presença aqui não é checkbox.</strong> A sala mede o tempo real de cada
          inscrito e quem permanece <strong>{minutosMinimos} minutos ou mais</strong> conta
          como presente — ninguém marca presença na mão, e por isso a taxa desta tela é a
          mesma que o time discute na reunião de operação.
        </span>
      </p>

      <div className="card mt-5 overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-line text-left align-bottom text-xs font-semibold text-muted">
              <th className="px-4 py-3">Sessão</th>
              <th className="px-4 py-3">Closer</th>
              <th className="px-4 py-3 text-right">Inscritos</th>
              <th className="px-4 py-3 text-right">Presentes</th>
              <th className="w-[200px] px-4 py-3">
                Presença
                <span className="block text-[10px] font-medium">
                  medida por tempo de sala (≥ {minutosMinimos} min)
                </span>
              </th>
              <th className="px-4 py-3 text-right">
                Leads A/B
                <span className="block text-[10px] font-medium">qualificados presentes</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <p className="text-sm font-medium">Nenhuma sessão nesta semana.</p>
                  <p className="mx-auto mt-1.5 max-w-sm text-xs text-muted">
                    As sessões coletivas nascem dos templates recorrentes. Use as setas no
                    topo para ver outra semana ou revise os dias e horários do template.
                  </p>
                </td>
              </tr>
            )}

            {sessions.map((session) => {
              const inicio = session.startsAt;
              // Só com a sala fechada os números são a foto final — e essa
              // régua é a mesma do drawer e da consulta, em `lib/presenca`.
              const situacao = situacaoDaSessao(session, now);
              const cancelada = situacao === "cancelada";
              const futura = situacao === "futura";
              const emAndamento = situacao === "emAndamento";
              const medida = situacao === "medida";
              const hoje = isSameDay(inicio, now);

              const params = new URLSearchParams({ sessao: session.id });
              if (offset) params.set("w", String(offset));

              return (
                <tr
                  key={session.id}
                  className="border-b border-line last:border-b-0 hover:bg-surface-2/50"
                >
                  <td className="px-4 py-3">
                    <Link href={`${base}?${params.toString()}`} className="group block">
                      <span className="flex items-center gap-1.5 font-medium group-hover:text-waz-20">
                        <span className={cancelada ? "line-through text-muted" : undefined}>
                          {session.template?.name ?? "Sessão coletiva"}
                        </span>
                        {hoje && !cancelada && (
                          <span className="chip bg-waz-90 px-2 py-0.5 text-[10px] text-waz-20">
                            hoje
                          </span>
                        )}
                        {cancelada && (
                          <span className="chip bg-red-50 px-2 py-0.5 text-[10px] text-red-700">
                            cancelada
                          </span>
                        )}
                        <ChevronRight className="size-3.5 opacity-0 transition group-hover:opacity-100" />
                      </span>
                      <span className="block text-xs text-muted">
                        {inicio.toLocaleDateString("pt-BR", { timeZone: TZ,
                          weekday: "short",
                          day: "2-digit",
                          month: "short",
                        })}
                        {" · "}
                        <span className="font-mono">{hhmm(session.startsAt)}</span>
                        {` · ${Math.round((session.endsAt.getTime() - session.startsAt.getTime()) / 60_000)} min`}
                      </span>
                    </Link>
                  </td>

                  <td className="px-4 py-3 text-muted">{session.owner.name}</td>

                  <td className="px-4 py-3 text-right font-medium">
                    {session.inscritos}
                    <span className="block text-[11px] font-normal text-muted">
                      de {(session.capacity ?? 0)} vagas
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right font-medium">
                    {medida ? session.presentes : <span className="text-muted">—</span>}
                  </td>

                  <td className="px-4 py-3">
                    {cancelada ? (
                      <span className="text-xs text-muted">Sessão cancelada</span>
                    ) : futura ? (
                      <span className="text-xs text-muted">
                        Ainda não aconteceu — o tempo é medido durante a call
                      </span>
                    ) : emAndamento ? (
                      <span className="text-xs text-muted">
                        Em andamento — o tempo na sala ainda está correndo
                      </span>
                    ) : (
                      <Presenca taxa={session.taxaPresenca} />
                    )}
                  </td>

                  <td className="px-4 py-3 text-right font-medium">
                    {medida ? session.qualificados : <span className="text-muted">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Barra + número: a cor nunca é o único sinal da taxa. */
function Presenca({ taxa }: { taxa: number }) {
  const cor =
    taxa >= META_PRESENCA ? "bg-waz-40" : taxa >= META_PRESENCA / 2 ? "bg-amber-400" : "bg-red-400";

  return (
    <span className="flex items-center gap-2.5">
      <span className="h-1.5 w-full max-w-[112px] overflow-hidden rounded-full bg-surface-2">
        <span className={`block h-full rounded-full ${cor}`} style={{ width: `${taxa}%` }} />
      </span>
      <span className="w-10 shrink-0 text-right text-xs font-semibold">{taxa}%</span>
    </span>
  );
}

function Metric({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ElementType;
  tone?: "positivo" | "negativo";
}) {
  const cor =
    tone === "positivo" ? "text-waz-20" : tone === "negativo" ? "text-amber-700" : "text-foreground";

  return (
    <div className="card p-5">
      <p className="flex items-center gap-2 text-xs font-semibold text-muted">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${cor}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
