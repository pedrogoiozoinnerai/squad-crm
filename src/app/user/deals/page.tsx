import { DealsView } from "@/components/deals/DealsView";
import { requireUser } from "@/lib/auth";
import { getAllDeals } from "@/lib/queries";

const BASE = "/user/deals";

export default async function DealsPage(props: PageProps<"/user/deals">) {
  const user = await requireUser("user");
  const { q, status } = await props.searchParams;

  const query = (Array.isArray(q) ? q[0] : q) ?? "";
  const filter = (Array.isArray(status) ? status[0] : status) ?? "all";

  const deals = await getAllDeals(user, { q: query, status: filter });

  return (
    <DealsView
      deals={deals}
      showOwner={user.role === "ADMIN"}
      basePath={BASE}
      pipelinePath="/user/pipeline"
      query={query}
      status={filter}
    />
  );
}
