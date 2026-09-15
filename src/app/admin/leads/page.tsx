import { LeadDrawer } from "@/components/leads/LeadDrawer";
import { LeadsView } from "@/components/leads/LeadsView";
import { requireUser } from "@/lib/auth";
import { getLeads } from "@/lib/queries";

const BASE = "/admin/leads";

export default async function LeadsPage(props: PageProps<"/admin/leads">) {
  const user = await requireUser("admin");
  const { lead: leadParam } = await props.searchParams;
  const leadId = Array.isArray(leadParam) ? leadParam[0] : leadParam;

  const { leads, totais } = await getLeads(user);

  return (
    <>
      <LeadsView leads={leads} totais={totais} showOwner={user.role === "ADMIN"} basePath={BASE} />
      {leadId && <LeadDrawer leadId={leadId} user={user} closeHref={BASE} />}
    </>
  );
}
