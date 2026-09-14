import { DealDrawer } from "@/components/pipeline/DealDrawer";
import { PipelineView } from "@/components/pipeline/PipelineView";
import { requireUser } from "@/lib/auth";
import { getPipeline } from "@/lib/queries";

const BASE = "/user/pipeline";

export default async function PipelinePage(props: PageProps<"/user/pipeline">) {
  const user = await requireUser("user");
  const { deal: dealParam } = await props.searchParams;
  const dealId = Array.isArray(dealParam) ? dealParam[0] : dealParam;

  const { stages, deals } = await getPipeline(user);

  return (
    <>
      <PipelineView
        stages={stages}
        deals={deals}
        showOwner={user.role === "ADMIN"}
        basePath={BASE}
      />
      {dealId && <DealDrawer dealId={dealId} user={user} closeHref={BASE} />}
    </>
  );
}
