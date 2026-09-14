import {
  Briefcase,
  CalendarCheck,
  CalendarDays,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  DownloadCloud,
  UserPlus,
  Users,
} from "lucide-react";

export type Space = "admin" | "user";

export const NAV = [
  { slug: "inicio", label: "Início", icon: LayoutDashboard, feature: "inicio" },
  { slug: "calendar", label: "Calendário", icon: CalendarDays, feature: "calendar" },
  { slug: "agenda", label: "Minha agenda", icon: CalendarCheck, feature: "agenda" },
  { slug: "leads", label: "Leads", icon: UserPlus, feature: "leads" },
  { slug: "pipeline", label: "Pipeline", icon: KanbanSquare, feature: "pipeline" },
  { slug: "deals", label: "Negócios", icon: Briefcase, feature: "deals" },
  { slug: "tarefas", label: "Tarefas", icon: ListChecks, feature: "tarefas" },
] as const;

export const ADMIN_NAV = [
  { slug: "usuarios", label: "Usuários", icon: Users, feature: "usuarios" },
  { slug: "importar", label: "Importar do Funil", icon: DownloadCloud, feature: "importar" },
] as const;

export function hrefFor(space: Space, slug: string) {
  return `/${space}/${slug}`;
}
