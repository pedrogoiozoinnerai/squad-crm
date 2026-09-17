import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ListChecks,
  TrendingUp,
  Trophy,
} from "lucide-react";

import { PageHeader } from "@/components/shell/PageHeader";
import { TZ, brl, hhmm } from "@/lib/dates";

export type TeamRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  ganhoCents: number;
  ganhos: number;
  pipelineCents: number;
  abertos: number;
  pendentes: number;
  atrasadas: number;
  reunioesSemana: number;
};

export type TeamData = {
  linhas: TeamRow[];
  totalGanhoCents: number;
  totalGanhos: number;
  totalAtrasadas: number;
};

/** Tela exclusiva de admin — os destinos são sempre do espaço /admin. */
const BASE = "/admin/time";
const TAREFAS = "/admin/tarefas";
const USUARIOS = "/admin/usuarios";

/** Uma tabela de time não cresce sem limite na tela; o resto vira nota de rodapé. */
const LIMITE = 50;

export const ORDENS = ["ganho", "pipeline", "atrasadas", "reunioes"] as const;
export const RECORTES = ["todos", "atraso"] as const;

export type Ordem = (typeof ORDENS)[number];
export type Recorte = (typeof RECORTES)[number];

const COMPARADORES: Record<Ordem, (a: TeamRow, b: TeamRow) => number> = {
  ganho: (a, b) => b.ganhoCents - a.ganhoCents,
  pipeline: (a, b) => b.pipelineCents - a.pipelineCents,
  atrasadas: (a, b) => b.atrasadas - a.atrasadas || b.pendentes - a.pendentes,
  reunioes: (a, b) => b.reunioesSemana - a.reunioesSemana,
};

const FILTROS: Record<Recorte, (linha: TeamRow) => boolean> = {
  todos: () => true,
  atraso: (linha) => linha.atrasadas > 0,
};

const RECORTE_LABEL: Record<Recorte, string> = {
  todos: "Todo o time",
  atraso: "Com tarefa atrasada",
};

function plural(n: number, singular: string, pluralForm: string) {
  return n === 1 ? singular : pluralForm;
}

/** "a, b e c" — a frase de estado precisa soar como frase, não como lista. */
function enumerar(partes: string[]) {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

function href(ordem: Ordem, recorte: Recorte) {
  const params = new URLSearchParams();
  if (ordem !== "ganho") params.set("ordenar", ordem);
  if (recorte !== "todos") params.set("ver", recorte);
  const query = params.toString();
  return query ? `${BASE}?${query}` : BASE;
}

export function TeamView({
  data,
  now,
  ordem,
  recorte,
}: {
  data: TeamData;
  /** Instante único vindo da page: o componente nunca cria a própria data. */
  now: Date;
  ordem: Ordem;
  recorte: Recorte;
}) {
  const { linhas } = data;

  const closers = linhas.length;
  const comAtraso = linhas.filter((l) => l.atrasadas > 0).length;
  const totalPipeline = linhas.reduce((s, l) => s + l.pipelineCents, 0);
  const totalAbertos = linhas.reduce((s, l) => s + l.abertos, 0);
  const totalPendentes = linhas.reduce((s, l) => s + l.pendentes, 0);
  const totalReunioes = linhas.reduce((s, l) => s + l.reunioesSemana, 0);
  const semReuniao = linhas.filter((l) => l.reunioesSemana === 0).length;
  const maiorGanho = Math.max(1, ...linhas.map((l) => l.ganhoCents));

  // ── A frase de estado: o briefing do dia antes de qualquer número ──
  const problemas: string[] = [];
  if (data.totalAtrasadas > 0) {
    problemas.push(
      `${data.totalAtrasadas} ${plural(data.totalAtrasadas, "tarefa atrasada", "tarefas atrasadas")} em ${comAtraso} ${plural(comAtraso, "closer", "closers")}`,
    );
  }

  const cabeca = `Time de ${closers} ${plural(closers, "closer", "closers")}.`;
  const frase =
    closers === 0
      ? "Nenhum closer ativo no CRM ainda."
      : problemas.length === 0
        ? `${cabeca} Tudo em dia por aqui — nenhuma tarefa atrasada.`
        : `${cabeca} Hoje: ${enumerar(problemas)}.`;

  // ── A tabela: recorte e ordem vêm da URL, nunca de estado local ──
  const visiveis = [...linhas].filter(FILTROS[recorte]).sort(COMPARADORES[ordem]);
  const mostradas = visiveis.slice(0, LIMITE);
  // O troféu só vale quando a lista é o ranking de verdade: time inteiro e
  // ordenado por resultado. Sob recorte, o topo é o topo de um pedaço; ordenar
  // por atraso põe o pior caso em primeiro. Nos dois casos o troféu mentiria.
  const destacaTopo = ordem !== "atrasadas" && recorte === "todos";

  const dia = now.toLocaleDateString("pt-BR", { timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <>
      <PageHeader
        title="Meu Time"
        subtitle={`${dia} · atualizado às ${hhmm(now)}`}
        actions={
          <Link href={USUARIOS} className="btn-ghost">
            Gerenciar closers
          </Link>
        }
      />

      <p className="mb-5 max-w-3xl text-[17px] leading-relaxed font-medium">{frase}</p>

      {/* ── Alertas: a regra explicada, o caso concreto e o link que resolve ── */}
      {data.totalAtrasadas > 0 && (
        <Faixa
          tone="alerta"
          icon={AlertTriangle}
          titulo={`${data.totalAtrasadas} ${plural(data.totalAtrasadas, "tarefa atrasada", "tarefas atrasadas")} em ${comAtraso} ${plural(comAtraso, "closer", "closers")}`}
          explicacao="Tarefa atrasada é tarefa pendente com vencimento já no passado — ela não sai da fila sozinha. Abra a lista para concluir, reagendar ou passar para outro closer."
          acoes={
            <>
              <Link href={TAREFAS} className="btn-primary">
                Abrir tarefas
                <ArrowRight className="size-4" />
              </Link>
              {recorte !== "atraso" && (
                <Link href={href(ordem, "atraso")} className="btn-ghost">
                  Ver quem está atrasado
                </Link>
              )}
            </>
          }
        />
      )}

      {closers > 0 && problemas.length === 0 && (
        <Faixa
          tone="ok"
          icon={CheckCircle2}
          titulo="Nada exigindo você agora"
          explicacao="Conferimos as tarefas vencidas de cada closer: nenhuma pendente. Use o ranking abaixo para puxar a conversa de performance."
        />
      )}

      {/* ── Os números do time ─────────────────────────────────────── */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Ganho no mês — time"
          value={brl(data.totalGanhoCents)}
          hint={`${data.totalGanhos} ${plural(data.totalGanhos, "negócio fechado", "negócios fechados")} desde o dia 1º`}
          icon={Trophy}
          tone="positivo"
        />
        <Metric
          label="Pipeline aberto"
          value={brl(totalPipeline)}
          hint={`${totalAbertos} ${plural(totalAbertos, "negócio em aberto", "negócios em aberto")}`}
          icon={TrendingUp}
        />
        <Metric
          label="Tarefas atrasadas"
          value={String(data.totalAtrasadas)}
          hint={`${totalPendentes} ${plural(totalPendentes, "pendente no total", "pendentes no total")}`}
          icon={ListChecks}
          tone={data.totalAtrasadas > 0 ? "negativo" : undefined}
        />
        <Metric
          label="Reuniões na semana"
          value={String(totalReunioes)}
          hint={
            semReuniao > 0
              ? `${semReuniao} ${plural(semReuniao, "closer sem nenhuma", "closers sem nenhuma")}`
              : "todo closer com agenda na semana"
          }
          icon={CalendarDays}
        />
      </div>

      {/* ── Ranking por closer ─────────────────────────────────────── */}
      <section className="card mt-4 overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Ranking por closer</h2>
            <p className="mt-0.5 text-xs text-muted">
              {visiveis.length} de {closers} {plural(closers, "closer", "closers")} ·{" "}
              {RECORTE_LABEL[recorte]}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {RECORTES.map((key) => (
              <Link
                key={key}
                href={href(ordem, key)}
                className={`chip border transition ${
                  recorte === key
                    ? "border-waz-50 bg-waz-95 text-waz-20"
                    : "border-line bg-surface text-muted hover:text-foreground"
                }`}
              >
                {RECORTE_LABEL[key]}
              </Link>
            ))}
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold text-muted">
                <th className="w-12 px-4 py-3">#</th>
                <th className="px-4 py-3">Closer</th>
                <Sortable campo="ganho" atual={ordem} recorte={recorte} label="Ganho no mês" />
                <Sortable campo="pipeline" atual={ordem} recorte={recorte} label="Pipeline aberto" />
                <th className="px-4 py-3">Tarefas</th>
                <Sortable
                  campo="atrasadas"
                  atual={ordem}
                  recorte={recorte}
                  label="Atrasadas"
                  align="left"
                />
                <Sortable
                  campo="reunioes"
                  atual={ordem}
                  recorte={recorte}
                  label="Reuniões"
                  align="left"
                />
              </tr>
            </thead>
            <tbody>
              {mostradas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center">
                    <p className="text-muted">
                      {closers === 0
                        ? "Nenhum closer ativo. Cadastre o time em Usuários para o painel ganhar vida."
                        : recorte === "atraso"
                          ? "Ninguém com tarefa atrasada neste recorte — e isso é boa notícia."
                          : "Nenhum closer neste recorte."}
                    </p>
                    <Link
                      href={closers === 0 ? USUARIOS : href(ordem, "todos")}
                      className="btn-ghost mt-4"
                    >
                      {closers === 0 ? "Abrir Usuários" : "Ver todo o time"}
                    </Link>
                  </td>
                </tr>
              )}

              {mostradas.map((linha, i) => {
                const lider = destacaTopo && i === 0;

                return (
                  <tr
                    key={linha.id}
                    className={`border-b border-line last:border-b-0 ${
                      linha.atrasadas > 0 ? "bg-red-50/40" : lider ? "bg-waz-95/70" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`grid size-6 place-items-center rounded-full text-[11px] font-bold ${
                          lider
                            ? "bg-waz-30 text-white"
                            : destacaTopo && i < 3
                              ? "bg-waz-90 text-waz-20"
                              : "bg-surface-2 text-muted"
                        }`}
                      >
                        {lider ? <Trophy className="size-3" /> : i + 1}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 font-medium">
                        {linha.name}
                        {linha.role === "ADMIN" && (
                          <span className="chip bg-surface-2 text-[10px] text-muted">Admin</span>
                        )}
                      </span>
                      <span className="block text-xs text-muted">{linha.email}</span>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${linha.ganhoCents > 0 ? "text-waz-20" : ""}`}>
                        {brl(linha.ganhoCents)}
                      </span>
                      <span className="block text-xs text-muted">
                        {linha.ganhos} {plural(linha.ganhos, "negócio", "negócios")}
                      </span>
                      <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-2">
                        <span
                          className="block h-full rounded-full bg-waz-50"
                          style={{ width: `${(linha.ganhoCents / maiorGanho) * 100}%` }}
                        />
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <span className="font-medium">{brl(linha.pipelineCents)}</span>
                      <span className="block text-xs text-muted">
                        {linha.abertos} em aberto
                      </span>
                    </td>

                    <td className="px-4 py-3 text-muted">
                      {linha.pendentes} {plural(linha.pendentes, "pendente", "pendentes")}
                    </td>

                    <td className="px-4 py-3">
                      {linha.atrasadas === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <Link href={TAREFAS} className="chip bg-red-50 text-red-700 hover:bg-red-100">
                          <AlertTriangle className="size-3.5" />
                          {linha.atrasadas}
                        </Link>
                      )}
                    </td>

                    <td className="px-4 py-3 text-muted">
                      {linha.reunioesSemana === 0 ? "—" : linha.reunioesSemana}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {visiveis.length > LIMITE && (
          <p className="border-t border-line px-5 py-3 text-xs text-muted">
            Mostrando os {LIMITE} primeiros de {visiveis.length}. Use os recortes acima para
            estreitar a lista.
          </p>
        )}
      </section>

      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-muted">
        Ganho no mês soma os negócios marcados como ganhos desde o dia 1º. Pipeline aberto é a soma
        dos negócios em aberto, sem ponderar pela probabilidade. Reuniões contam da segunda-feira
        desta semana em diante. Ordem e recorte ficam na URL — o link que você copiar abre a mesma
        visão para quem receber.
      </p>
    </>
  );
}

function Sortable({
  campo,
  atual,
  recorte,
  label,
  align = "right",
}: {
  campo: Ordem;
  atual: Ordem;
  recorte: Recorte;
  label: string;
  align?: "left" | "right";
}) {
  const ativo = campo === atual;

  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : ""}`}>
      <Link
        href={href(campo, recorte)}
        className={`inline-flex items-center gap-1 transition hover:text-foreground ${
          ativo ? "text-waz-20" : ""
        }`}
      >
        {label}
        {ativo && <span aria-hidden>↓</span>}
      </Link>
    </th>
  );
}

const TONES = {
  alerta: { box: "border-l-4 border-l-red-400 bg-red-50/50", icon: "bg-red-100 text-red-700" },
  atencao: {
    box: "border-l-4 border-l-amber-400 bg-amber-50/50",
    icon: "bg-amber-100 text-amber-800",
  },
  ok: { box: "border-l-4 border-l-waz-50 bg-waz-95/60", icon: "bg-waz-90 text-waz-20" },
} as const;

function Faixa({
  tone,
  icon: Icon,
  titulo,
  explicacao,
  acoes,
}: {
  tone: keyof typeof TONES;
  icon: React.ElementType;
  titulo: string;
  explicacao: string;
  acoes?: React.ReactNode;
}) {
  const estilo = TONES[tone];

  return (
    <section className={`card mb-3 flex flex-wrap items-start gap-4 p-4 ${estilo.box}`}>
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${estilo.icon}`}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-[240px] flex-1">
        <p className="text-sm font-semibold">{titulo}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">{explicacao}</p>
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </section>
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
    tone === "positivo" ? "text-waz-20" : tone === "negativo" ? "text-red-700" : "text-foreground";

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
