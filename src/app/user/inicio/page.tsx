import { DashboardView } from "@/components/dashboard/DashboardView";
import { requireUser } from "@/lib/auth";
import { getDashboard } from "@/lib/queries";

export default async function InicioPage() {
  const user = await requireUser("user");
  const data = await getDashboard(user);

  return (
    <DashboardView
      data={data}
      space="user"
      userName={user.name}
      isAdmin={user.role === "ADMIN"}
    />
  );
}
