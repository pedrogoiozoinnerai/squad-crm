"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";

import { signOut } from "@/app/actions/auth";
import { ADMIN_NAV, NAV, hrefFor, type Space } from "@/lib/nav";

type Props = {
  space: Space;
  user: { name: string; email: string };
  /** Vazio = libera tudo (nenhuma permissão cadastrada). */
  features: string[];
};

export function Sidebar({ space, user, features }: Props) {
  const liberado = (feature: string) =>
    features.length === 0 || features.includes(feature);
  const pathname = usePathname();
  const isAdmin = space === "admin";

  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <aside className="sticky top-0 flex h-dvh w-[236px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="px-6 pt-7 pb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-black.svg" alt="Squad.com" className="h-5 w-auto" />
        <p className="mt-2 text-xs font-semibold tracking-[0.18em] text-muted uppercase">
          CRM
        </p>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV.filter((item) => liberado(item.feature)).map((item) => (
          <NavLink
            key={item.slug}
            href={hrefFor(space, item.slug)}
            label={item.label}
            icon={item.icon}
            active={pathname === hrefFor(space, item.slug)}
          />
        ))}

        {isAdmin && ADMIN_NAV.some((i) => liberado(i.feature)) && (
          <>
            <p className="mt-6 mb-1 px-3 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
              Administração
            </p>
            {ADMIN_NAV.filter((item) => liberado(item.feature)).map((item) => (
              <NavLink
                key={item.slug}
                href={hrefFor(space, item.slug)}
                label={item.label}
                icon={item.icon}
                active={pathname === hrefFor(space, item.slug)}
              />
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-waz-90 text-xs font-bold text-waz-20">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{user.name}</span>
            <span className="block truncate text-xs text-muted">{user.email}</span>
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between px-2">
          <span className="chip bg-surface-2 text-muted">
            {isAdmin ? "Admin" : "Vendedor"}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-foreground"
            >
              <LogOut className="size-3.5" />
              Sair
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
        active
          ? "bg-waz-95 text-waz-20"
          : "text-muted hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      <Icon className={`size-[18px] ${active ? "text-waz-40" : ""}`} />
      {label}
    </Link>
  );
}
