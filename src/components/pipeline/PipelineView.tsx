import { PipelineBoard, type BoardDeal, type BoardStage } from "@/components/pipeline/PipelineBoard";
import { PageHeader } from "@/components/shell/PageHeader";
import { brl } from "@/lib/dates";

export function PipelineView({
  stages,
  deals,
  showOwner,
  basePath,
}: {
  stages: BoardStage[];
  deals: BoardDeal[];
  showOwner: boolean;
  basePath: string;
}) {
  const total = deals.reduce((sum, deal) => sum + deal.valueCents, 0);
  const weighted = deals.reduce((sum, deal) => sum + deal.valueCents * (deal.probability / 100), 0);

  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle="Arraste os cards para mover o negócio de etapa"
        actions={
          <div className="flex items-center gap-2">
            <span className="chip bg-surface-2 text-muted">
              Pipeline <strong className="text-foreground">{brl(total)}</strong>
            </span>
            <span className="chip bg-waz-95 text-waz-20">
              Ponderado <strong>{brl(weighted)}</strong>
            </span>
          </div>
        }
      />

      <PipelineBoard stages={stages} deals={deals} showOwner={showOwner} basePath={basePath} />
    </>
  );
}
