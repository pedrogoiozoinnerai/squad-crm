import { ORDENS, RECORTES, TeamView, type Ordem, type Recorte } from "@/components/team/TeamView";
import { requireUser } from "@/lib/auth";
import { getTeamOverview } from "@/lib/queries";

/** Recorte vindo da URL é texto de fora: só entra se estiver na lista. */
function escolher<T extends string>(
  raw: string | string[] | undefined,
  validos: readonly T[],
  padrao: T,
): T {
  const valor = Array.isArray(raw) ? raw[0] : raw;
  return validos.includes(valor as T) ? (valor as T) : padrao;
}

export default async function TimePage(props: PageProps<"/admin/time">) {
  // Painel do líder: só admin. O layout já barra, mas a page não confia nele.
  await requireUser("admin");

  const { ordenar, ver } = await props.searchParams;
  const ordem = escolher<Ordem>(ordenar, ORDENS, "ganho");
  const recorte = escolher<Recorte>(ver, RECORTES, "todos");

  const data = await getTeamOverview();

  // O "agora" nasce aqui e desce como prop — componente não cria data.
  return <TeamView data={data} now={new Date()} ordem={ordem} recorte={recorte} />;
}
