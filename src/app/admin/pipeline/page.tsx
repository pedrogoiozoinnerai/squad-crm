import { DealDrawer } from "@/components/pipeline/DealDrawer";
import { PipelineView } from "@/components/pipeline/PipelineView";
import { requireUser } from "@/lib/auth";
import { getOwners, getPipeline } from "@/lib/queries";

const BASE = "/admin/pipeline";

/// Um parâmetro de URL pode chegar repetido (`?q=a&q=b`). Fica com o primeiro
/// em vez de mandar um array para o filtro.
function texto(valor: string | string[] | undefined) {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? "";
}

export default async function PipelinePage(props: PageProps<"/admin/pipeline">) {
  const user = await requireUser("admin");
  const params = await props.searchParams;

  const dealId = texto(params.deal) || undefined;
  const filtros = {
    q: texto(params.q),
    prazo: texto(params.prazo),
    ordem: texto(params.ordem),
    closer: texto(params.closer),
  };

  // Um relógio só para a página inteira: os cartões calculam "atrasada há 3d"
  // a partir dele, e duas leituras diferentes dariam textos diferentes.
  const agora = new Date();

  const [{ stages, deals, total, valueCents, weightedCents }, owners] = await Promise.all([
    getPipeline(user, filtros, agora),
    user.role === "ADMIN" ? getOwners() : Promise.resolve([]),
  ]);

  return (
    <>
      <PipelineView
        stages={stages}
        deals={deals}
        showOwner={user.role === "ADMIN"}
        basePath={BASE}
        leadsPath="/admin/leads"
        dealsPath="/admin/deals"
        owners={owners}
        filtros={filtros}
        total={total}
        valueCents={valueCents}
        weightedCents={weightedCents}
        agora={agora}
      />
      {dealId && <DealDrawer dealId={dealId} user={user} closeHref={BASE} />}
    </>
  );
}
