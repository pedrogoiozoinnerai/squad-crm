import { LeadDrawer } from "@/components/leads/LeadDrawer";
import { LeadsView } from "@/components/leads/LeadsView";
import { requireUser } from "@/lib/auth";
import { getLeads } from "@/lib/queries";

const BASE = "/user/leads";

export default async function LeadsPage(props: PageProps<"/user/leads">) {
  const user = await requireUser("user");
  const { lead: leadParam } = await props.searchParams;
  const leadId = Array.isArray(leadParam) ? leadParam[0] : leadParam;

  const leads = await getLeads(user);

  return (
    <>
      <LeadsView leads={leads} showOwner={user.role === "ADMIN"} basePath={BASE} />
      {leadId && <LeadDrawer leadId={leadId} user={user} closeHref={BASE} />}
    </>
  );
}
