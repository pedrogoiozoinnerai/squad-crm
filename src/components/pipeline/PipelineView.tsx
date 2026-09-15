import Link from "next/link";
import { Download, List, UserPlus } from "lucide-react";

import { PipelineBoard, type BoardDeal, type BoardStage } from "@/components/pipeline/PipelineBoard";
import { PipelineFiltros } from "@/components/pipeline/PipelineFiltros";
import { PageHeader } from "@/components/shell/PageHeader";
import { brl } from "@/lib/dates";

export function PipelineView({
  stages,
  deals,
  showOwner,
  basePath,
  leadsPath,
  dealsPath,
  owners,
  filtros,
  total,
  valueCents,
  weightedCents,
  agora,
}: {
  stages: BoardStage[];
  deals: BoardDeal[];
  showOwner: boolean;
  basePath: string;
  leadsPath: string;
  dealsPath: string;
  owners: { id: string; name: string }[];
  filtros: { q: string; prazo: string; ordem: string; closer: string };
  /// Totais do filtro inteiro, vindos do banco. Somar `deals` contaria só os
  /// 60 por coluna que couberam na tela — e o topo anunciava um pipeline
  /// menor que a soma das colunas logo abaixo dele.
  total: number;
  valueCents: number;
  weightedCents: number;
  agora: Date;
}) {
  // O CSV sai com o mesmo recorte que está na tela.
  const exportar = new URLSearchParams({ status: "OPEN" });
  for (const chave of ["q", "prazo", "closer"] as const) {
    if (filtros[chave]) exportar.set(chave, filtros[chave]);
  }

  const filtrando = Boolean(filtros.q || filtros.prazo || filtros.closer);

  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle={`${total} ${total === 1 ? "negócio aberto" : "negócios abertos"} · arraste os cards para mover de etapa`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip bg-surface-2 text-muted tabular-nums">
              Pipeline <strong className="text-foreground">{brl(valueCents)}</strong>
            </span>
            <span className="chip bg-waz-95 text-waz-20 tabular-nums">
              Ponderado <strong>{brl(weightedCents)}</strong>
            </span>
            <Link href={dealsPath} className="btn-ghost">
              <List className="size-4" />
              Lista
            </Link>
            <a href={`/api/deals/export?${exportar.toString()}`} className="btn-ghost">
              <Download className="size-4" />
              Exportar CSV
            </a>
            <Link href={`${leadsPath}?lead=new`} className="btn-primary">
              <UserPlus className="size-4" />
              Novo lead
            </Link>
          </div>
        }
      />

      <PipelineFiltros
        basePath={basePath}
        q={filtros.q}
        prazo={filtros.prazo}
        ordem={filtros.ordem}
        closer={filtros.closer}
        owners={owners}
      />

      {total === 0 ? (
        <div className="card px-6 py-16 text-center">
          <p className="text-sm font-semibold">
            {filtrando
              ? "Nenhum negócio aberto com esse filtro."
              : "Nenhum negócio aberto no pipeline."}
          </p>
          <p className="mt-1 text-sm text-muted">
            {filtrando
              ? "Tente limpar a busca ou escolher outro recorte de prazo."
              : "Cadastre um lead e converta em negócio para começar."}
          </p>
        </div>
      ) : (
        <PipelineBoard
          stages={stages}
          deals={deals}
          showOwner={showOwner}
          basePath={basePath}
          filtrado={filtrando}
          agora={agora}
        />
      )}
    </>
  );
}
