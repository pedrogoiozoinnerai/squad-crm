import { Sidebar } from "@/components/shell/Sidebar";
import type { SessionUser } from "@/lib/auth";
import type { Space } from "@/lib/nav";

export function AppShell({
  space,
  user,
  children,
}: {
  space: Space;
  user: SessionUser;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar
        space={space}
        user={{ name: user.name, email: user.email }}
        features={user.features}
      />
      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
