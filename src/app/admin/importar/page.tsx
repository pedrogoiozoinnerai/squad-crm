import { ImportPanel } from "@/components/admin/ImportPanel";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireUser } from "@/lib/auth";
import { funnelConfigured } from "@/lib/type-funnel";

export default async function ImportPage() {
  await requireUser("admin");

  return (
    <>
      <PageHeader
        title="Importar do Funil"
        subtitle="Traz para o CRM os leads que concluíram o Funil do Type"
      />
      <ImportPanel configured={funnelConfigured()} />
    </>
  );
}
