import { DealsView } from "@/components/deals/DealsView";
import { requireUser } from "@/lib/auth";
import { getAllDeals } from "@/lib/queries";

const BASE = "/admin/deals";

export default async function DealsPage(props: PageProps<"/admin/deals">) {
  const user = await requireUser("admin");
  const { q, status } = await props.searchParams;

  const query = (Array.isArray(q) ? q[0] : q) ?? "";
  const filter = (Array.isArray(status) ? status[0] : status) ?? "all";

  const { deals, total, valueCents, wonCents } = await getAllDeals(user, { q: query, status: filter });

  return (
    <DealsView
      deals={deals}
      total={total}
      valueCents={valueCents}
      wonCents={wonCents}
      showOwner={user.role === "ADMIN"}
      basePath={BASE}
      pipelinePath="/admin/pipeline"
      query={query}
      status={filter}
    />
  );
}
