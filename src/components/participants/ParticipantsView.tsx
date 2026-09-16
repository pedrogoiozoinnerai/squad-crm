import Link from "next/link";
import { Percent, Search, Sparkles, UserCheck, Users } from "lucide-react";

import { tempoNaSala } from "@/components/sessions/SessionsView";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { TZ, hhmm } from "@/lib/dates";

type Row = {
  id: string;
  attended: boolean;
  totalSeconds: number;
  lead: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    segment: string | null;
    score: string | null;
  };
  meeting: {
    id: string;
    startsAt: Date;
    owner: { name: string };
  };
};

export const PRESENCA = [
  { key: "all", label: "Todos" },
  { key: "presente", label: "Presentes" },
  { key: "ausente", label: "Ausentes" },
];

export const SCORE = [
  { key: "all", label: "Todos" },
  { key: "A", label: "A" },
  { key: "B", label: "B" },
  { key: "C", label: "C" },
  { key: "D", label: "D" },
  { key: "E", label: "E" },
];

/** Espelha o `take` de `getParticipants`: sem isso o corte da lista fica mudo. */
const LIMITE = 300;

export type Filters = { q: string; presenca: string; score: string };

/**
 * Recorte vindo da URL, já saneado: um valor inventado na query string viraria
 * um filtro invisível — nenhum chip aceso e a lista vazia sem explicação.
 */
export function parseFilters(params: Record<string, string | string[] | undefined>): Filters {
  const one = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value) ?? "";

  const presenca = one(params.presenca);
  const score = one(params.score);

  return {
    q: one(params.q),
    presenca: PRESENCA.some((p) => p.key === presenca) ? presenca : "all",
    score: SCORE.some((s) => s.key === score) ? score : "all",
  };
}

export function ParticipantsView({
  participants,
  showOwner,
  basePath,
  leadsPath,
  filters,
  now,
}: {
  participants: Row[];
  /** Vendedor só enxerga as próprias sessões: a coluna de closer seria o próprio nome. */
  showOwner: boolean;
  basePath: string;
  leadsPath: string;
  filters: Filters;
  now: Date;
}) {
  // A sessão só conta para a taxa de presença depois de ter acontecido.
  const linhas = participants.map((p) => ({
    ...p,
    futura: p.meeting.startsAt > now,
  }));

  const realizadas = linhas.filter((l) => !l.futura);
  const presentes = realizadas.filter((l) => l.attended).length;
  const taxa = realizadas.length ? Math.round((presentes / realizadas.length) * 100) : 0;
  const qualificados = realizadas.filter(
    (l) => l.attended && (l.lead.score === "A" || l.lead.score === "B"),
  ).length;

  const filtrando = Boolean(filters.q) || filters.presenca !== "all" || filters.score !== "all";

  return (
    <>
      <PageHeader
        title="Participantes"
        subtitle={
          `${participants.length} ${participants.length === 1 ? "inscrição" : "inscrições"} no filtro` +
          (participants.length >= LIMITE
            ? ` · teto de ${LIMITE}: mostrando as inscrições mais recentes, refine a busca para ver o resto`
            : "")
        }
        actions={
          filtrando && (
            <Link href={basePath} className="btn-ghost">
              Limpar filtros
            </Link>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Inscrições"
          value={String(participants.length)}
          hint={`${realizadas.length} em sessões já realizadas`}
          icon={Users}
        />
        <Metric
          label="Presentes"
          value={String(presentes)}
          hint={`${realizadas.length - presentes} não apareceram`}
          icon={UserCheck}
          tone="positivo"
        />
        <Metric
          label="Taxa de presença"
          value={realizadas.length ? `${taxa}%` : "—"}
          hint="Sobre as inscrições em sessões já realizadas"
          icon={Percent}
        />
        <Metric
          label="Qualificados (A/B)"
          value={String(qualificados)}
          hint="Presentes com lead score A ou B"
          icon={Sparkles}
          tone="positivo"
        />
      </div>

      <form method="get" action={basePath} className="card my-5 flex flex-wrap items-center gap-3 p-3">
        {/* Buscar não pode derrubar o recorte de presença e score já escolhido. */}
        {filters.presenca !== "all" && <input type="hidden" name="presenca" value={filters.presenca} />}
        {filters.score !== "all" && <input type="hidden" name="score" value={filters.score} />}

        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Buscar por nome, e-mail ou empresa…"
            className="field pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {PRESENCA.map((opcao) => (
            <FilterChip
              key={opcao.key}
              href={hrefFor(basePath, { ...filters, presenca: opcao.key })}
              label={opcao.label}
              active={filters.presenca === opcao.key}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-muted">Score</span>
          {SCORE.map((opcao) => (
            <FilterChip
              key={opcao.key}
              href={hrefFor(basePath, { ...filters, score: opcao.key })}
              label={opcao.label}
              active={filters.score === opcao.key}
            />
          ))}
        </div>

        <button type="submit" className="btn-primary">
          Buscar
        </button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold text-muted">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Telefone</th>
              <th className="px-4 py-3">Setor</th>
              <th className="px-4 py-3">Lead score</th>
              {showOwner && <th className="px-4 py-3">Closer da sessão</th>}
              <th className="px-4 py-3">Data da sessão</th>
              <th className="px-4 py-3 text-right">Tempo na sala</th>
              <th className="px-4 py-3">Presença</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={showOwner ? 9 : 8} className="px-4 py-14 text-center text-muted">
                  {filtrando ? (
                    <>
                      Nenhum participante com esse recorte.
                      <Link href={basePath} className="ml-1 font-semibold text-waz-30 hover:underline">
                        Limpe os filtros
                      </Link>{" "}
                      para ver todas as inscrições.
                    </>
                  ) : (
                    "Ninguém inscrito ainda. Assim que um lead for agendado numa sessão, ele aparece aqui."
                  )}
                </td>
              </tr>
            )}

            {linhas.map((linha) => (
              <tr key={linha.id} className="border-b border-line last:border-b-0 hover:bg-surface-2/50">
                <td className="px-4 py-3">
                  <Link href={`${leadsPath}?lead=${linha.lead.id}`} className="block">
                    <span className="font-medium hover:text-waz-20">{linha.lead.name}</span>
                    <span className="block text-xs text-muted">
                      {linha.lead.company ?? "Sem empresa"}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">{linha.lead.email ?? "—"}</td>
                <td className="px-4 py-3 text-muted">{linha.lead.phone ?? "—"}</td>
                <td className="px-4 py-3 text-muted">{linha.lead.segment ?? "—"}</td>
                <td className="px-4 py-3">
                  {linha.lead.score ? <ScoreBadge score={linha.lead.score} /> : <span className="text-muted">—</span>}
                </td>
                {showOwner && (
                  <td className="px-4 py-3 text-muted">{linha.meeting.owner.name}</td>
                )}
                <td className="px-4 py-3">
                  <span className="block">
                    {linha.meeting.startsAt.toLocaleDateString("pt-BR", { timeZone: TZ,
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                    })}
                  </span>
                  <span className="block text-xs text-muted">{hhmm(linha.meeting.startsAt)}</span>
                </td>
                <td className="px-4 py-3 text-right font-medium">{tempoNaSala(linha.totalSeconds)}</td>
                <td className="px-4 py-3">
                  {linha.attended ? (
                    <span className="chip bg-waz-90 text-waz-20">Presente</span>
                  ) : linha.futura ? (
                    <span className="chip bg-surface-2 text-muted" title="A sessão ainda não aconteceu">
                      Agendado
                    </span>
                  ) : (
                    <span className="chip bg-red-50 text-red-700">Ausente</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function hrefFor(basePath: string, filters: Filters) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.presenca !== "all") params.set("presenca", filters.presenca);
  if (filters.score !== "all") params.set("score", filters.score);

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function FilterChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`chip border transition ${
        active
          ? "border-waz-50 bg-waz-95 text-waz-20"
          : "border-line bg-surface text-muted hover:text-foreground"
      }`}
    >
      {label}
    </Link>
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
  tone?: "positivo";
}) {
  return (
    <div className="card p-5">
      <p className="flex items-center gap-2 text-xs font-semibold text-muted">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-semibold tracking-tight ${
          tone === "positivo" ? "text-waz-20" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
