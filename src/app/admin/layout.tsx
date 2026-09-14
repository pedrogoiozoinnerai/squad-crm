import { AppShell } from "@/components/shell/AppShell";
import { requireUser } from "@/lib/auth";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireUser("admin");
  return (
    <AppShell space="admin" user={user}>
      {children}
    </AppShell>
  );
}
