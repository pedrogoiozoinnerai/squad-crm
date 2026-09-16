import { addDays } from "date-fns";

import { SessionDrawer } from "@/components/sessions/SessionDrawer";
import { parseWeekOffset, SessionsView } from "@/components/sessions/SessionsView";
import { requireUser } from "@/lib/auth";
import { weekStart } from "@/lib/dates";
import { getOwners, getSessions } from "@/lib/queries";
import { configuracao } from "@/lib/reconciliar";

const BASE = "/user/sessoes";

export default async function SessoesPage(props: PageProps<"/user/sessoes">) {
  const user = await requireUser("user");
  const { w, sessao } = await props.searchParams;

  const offset = parseWeekOffset(w);
  const sessionId = Array.isArray(sessao) ? sessao[0] : sessao;

  // `now` nasce aqui e desce como prop: componente puro não lê o relógio.
  const now = new Date();
  const start = weekStart(now, offset);
  const [sessions, regra, owners] = await Promise.all([
    getSessions(user, start, addDays(start, 7)),
    configuracao(),
    user.role === "ADMIN" ? getOwners() : Promise.resolve(undefined),
  ]);

  // Fechar o drawer volta para a mesma semana que o usuário estava vendo.
  const closeHref = offset ? `${BASE}?w=${offset}` : BASE;

  return (
    <>
      <SessionsView space="user" sessions={sessions} start={start} offset={offset} now={now} minutosMinimos={regra.presencaMinutos} owners={owners} />
      {sessionId && (
        <SessionDrawer sessionId={sessionId} user={user} now={now} closeHref={closeHref} minutosMinimos={regra.presencaMinutos} />
      )}
    </>
  );
}
