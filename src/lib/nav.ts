import {
  CalendarCheck,
  CalendarDays,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  Activity,
  DownloadCloud,
  Settings,
  UserPlus,
  Users,
  UsersRound,
  Video,
} from "lucide-react";

export type Space = "admin" | "user";

export const NAV = [
  { slug: "inicio", label: "Início", icon: LayoutDashboard, feature: "inicio" },
  { slug: "calendar", label: "Calendário", icon: CalendarDays, feature: "calendar" },
  { slug: "agenda", label: "Minha agenda", icon: CalendarCheck, feature: "agenda" },
  { slug: "leads", label: "Leads", icon: UserPlus, feature: "leads" },
  { slug: "pipeline", label: "Pipeline", icon: KanbanSquare, feature: "pipeline" },
  // "Negócios" saiu do menu: é a MESMA base do Pipeline, numa tabela. A tela
  // continua existindo e continua alcançável pelo botão "Lista" do Pipeline —
  // é lá que ela é útil, ao lado do que ela lista. Um item de menu para a
  // segunda visão do mesmo dado é o que faz o vendedor perguntar qual das duas
  // é a verdadeira.
  { slug: "tarefas", label: "Tarefas", icon: ListChecks, feature: "tarefas" },
  { slug: "sessoes", label: "Sessões", icon: Video, feature: "sessoes" },
  { slug: "participantes", label: "Participantes", icon: UsersRound, feature: "participantes" },
] as const;

export const ADMIN_NAV = [
  { slug: "time", label: "Meu Time", icon: Users, feature: "time" },
  { slug: "usuarios", label: "Usuários", icon: Users, feature: "usuarios" },
  { slug: "monitoramento", label: "Monitoramento", icon: Activity, feature: "monitoramento" },
  { slug: "configuracoes", label: "Configurações", icon: Settings, feature: "configuracoes" },
  { slug: "importar", label: "Importar do Funil", icon: DownloadCloud, feature: "importar" },
] as const;

export function hrefFor(space: Space, slug: string) {
  return `/${space}/${slug}`;
}

/// A cor do closer no calendário.
///
/// O calendário da referência pinta cada cartão pela cor do HEAD do time. Não
/// temos times, então a unidade que resta — e que é a que o gestor procura na
/// grade — é o próprio closer. A cor é derivada do id, não sorteada nem
/// guardada: a mesma pessoa tem a mesma cor em toda semana, em todo navegador,
/// sem coluna nova e sem estado.
const CORES_DE_CLOSER = [
  { fundo: "bg-waz-95", borda: "border-waz-70", ponto: "bg-waz-40" },
  { fundo: "bg-amber-50", borda: "border-amber-200", ponto: "bg-amber-400" },
  { fundo: "bg-sky-50", borda: "border-sky-200", ponto: "bg-sky-400" },
  { fundo: "bg-rose-50", borda: "border-rose-200", ponto: "bg-rose-400" },
  { fundo: "bg-violet-50", borda: "border-violet-200", ponto: "bg-violet-400" },
  { fundo: "bg-emerald-50", borda: "border-emerald-200", ponto: "bg-emerald-400" },
  { fundo: "bg-orange-50", borda: "border-orange-200", ponto: "bg-orange-400" },
  { fundo: "bg-teal-50", borda: "border-teal-200", ponto: "bg-teal-400" },
] as const;

export type CorDeCloser = (typeof CORES_DE_CLOSER)[number];

export function corDoCloser(ownerId: string): CorDeCloser {
  // Soma dos códigos: barato, estável e suficiente. Não precisa de dispersão
  // criptográfica — precisa de ser a MESMA cor toda vez.
  let soma = 0;
  for (let i = 0; i < ownerId.length; i++) soma = (soma + ownerId.charCodeAt(i)) % 100_000;
  return CORES_DE_CLOSER[soma % CORES_DE_CLOSER.length];
}
