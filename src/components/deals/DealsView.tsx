import Link from "next/link";
import { Download, Search } from "lucide-react";

import { PageHeader } from "@/components/shell/PageHeader";
import { brl } from "@/lib/dates";

type Row = {
  id: string;
  code: string;
  status: "OPEN" | "WON" | "LOST";
  valueCents: number;
  probability: number;
  expectedAt: Date | null;
  createdAt: Date;
  lead: { name: string; company: string | null; email: string | null };
  stage: { name: string; color: string };
  owner: { name: string };
};

const STATUS = {
  OPEN: { text: "Em aberto", tone: "bg-sky-50 text-sky-700" },
  WON: { text: "Ganho", tone: "bg-waz-90 text-waz-20" },
  LOST: { text: "Perdido", tone: "bg-red-50 text-red-700" },
} as const;

const FILTERS = [
  { key: "all", label: "Todos" },
  { key: "OPEN", label: "Em aberto" },
  { key: "WON", label: "Ganhos" },
  { key: "LOST", label: "Perdidos" },
];

export function DealsView({
  deals,
  showOwner,
  basePath,
  pipelinePath,
  query,
  status,
  total,
  valueCents,
  wonCents,
}: {
  deals: Row[];
  showOwner: boolean;
  basePath: string;
  pipelinePath: string;
  query: string;
  status: string;
  /// Vêm do banco, sobre o filtro inteiro. `deals` é só a primeira página:
  /// somar o array anunciaria "300 resultados · R$ 72 mil" para uma busca que
  /// casou com milhares de negócios e milhões em valor.
  total: number;
  valueCents: number;
  wonCents: number;
}) {
  const escondidos = Math.max(0, total - deals.length);

  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status !== "all") params.set("status", status);

  return (
    <>
      <PageHeader
        title="Negócios"
        subtitle={
          `${total} ${total === 1 ? "resultado" : "resultados"} · ${brl(valueCents)} no filtro · ${brl(wonCents)} ganho` +
          (escondidos > 0 ? ` · listando os ${deals.length} mais recentes` : "")
        }
        actions={
          <a href={`/api/deals/export?${params.toString()}`} className="btn-ghost">
            <Download className="size-4" />
            Exportar CSV
          </a>
        }
      />

      <form method="get" action={basePath} className="card mb-5 flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Buscar por nome, empresa, e-mail ou telefone…"
            className="field pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((filter) => {
            const next = new URLSearchParams();
            if (query) next.set("q", query);
            if (filter.key !== "all") next.set("status", filter.key);

            return (
              <Link
                key={filter.key}
                href={`${basePath}?${next.toString()}`}
                className={`chip border transition ${
                  status === filter.key
                    ? "border-waz-50 bg-waz-95 text-waz-20"
                    : "border-line bg-surface text-muted hover:text-foreground"
                }`}
              >
                {filter.label}
              </Link>
            );
          })}
        </div>
        <button type="submit" className="btn-primary">
          Buscar
        </button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[840px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold text-muted">
              <th className="px-4 py-3">Negócio</th>
              <th className="px-4 py-3">Etapa</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3">Previsão</th>
              {showOwner && <th className="px-4 py-3">Closer</th>}
              <th className="px-4 py-3">Criado em</th>
            </tr>
          </thead>
          <tbody>
            {deals.length === 0 && (
              <tr>
                <td colSpan={showOwner ? 7 : 6} className="px-4 py-14 text-center text-muted">
                  Nenhum negócio encontrado com esse filtro.
                </td>
              </tr>
            )}

            {deals.map((deal) => (
              <tr key={deal.id} className="border-b border-line last:border-b-0 hover:bg-surface-2/50">
                <td className="px-4 py-3">
                  <Link href={`${pipelinePath}?deal=${deal.id}`} className="block">
                    <span className="font-medium hover:text-waz-20">{deal.lead.name}</span>
                    <span className="block text-xs text-muted">
                      {deal.lead.company ?? "Sem empresa"} · <span className="font-mono">{deal.code}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <span className="size-2 rounded-full" style={{ backgroundColor: deal.stage.color }} />
                    {deal.stage.name}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`chip ${STATUS[deal.status].tone}`}>{STATUS[deal.status].text}</span>
                </td>
                <td className="px-4 py-3 text-right font-medium">{brl(deal.valueCents)}</td>
                <td className="px-4 py-3 text-muted">
                  {deal.expectedAt
                    ? deal.expectedAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
                    : "—"}
                </td>
                {showOwner && <td className="px-4 py-3 text-muted">{deal.owner.name}</td>}
                <td className="px-4 py-3 text-muted">
                  {deal.createdAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
