import { DashboardView } from "@/components/dashboard/DashboardView";
import { requireUser } from "@/lib/auth";
import { getDashboard } from "@/lib/queries";

export default async function InicioPage() {
  const user = await requireUser("admin");
  const data = await getDashboard(user);

  return (
    <DashboardView
      data={data}
      space="admin"
      userName={user.name}
      isAdmin={user.role === "ADMIN"}
    />
  );
}
