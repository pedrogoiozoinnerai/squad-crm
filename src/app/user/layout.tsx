import { AppShell } from "@/components/shell/AppShell";
import { requireUser } from "@/lib/auth";

export default async function UserLayout({ children }: LayoutProps<"/user">) {
  const user = await requireUser("user");
  return (
    <AppShell space="user" user={user}>
      {children}
    </AppShell>
  );
}
