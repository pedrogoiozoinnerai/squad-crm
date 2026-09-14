import { addDays } from "date-fns";

import { SessionDrawer } from "@/components/sessions/SessionDrawer";
import { parseWeekOffset, SessionsView } from "@/components/sessions/SessionsView";
import { requireUser } from "@/lib/auth";
import { weekStart } from "@/lib/dates";
import { getSessions } from "@/lib/queries";

const BASE = "/admin/sessoes";

export default async function SessoesPage(props: PageProps<"/admin/sessoes">) {
  const user = await requireUser("admin");
  const { w, sessao } = await props.searchParams;

  const offset = parseWeekOffset(w);
  const sessionId = Array.isArray(sessao) ? sessao[0] : sessao;

  // `now` nasce aqui e desce como prop: componente puro não lê o relógio.
  const now = new Date();
  const start = weekStart(now, offset);
  const sessions = await getSessions(user, start, addDays(start, 7));

  // Fechar o drawer volta para a mesma semana que o usuário estava vendo.
  const closeHref = offset ? `${BASE}?w=${offset}` : BASE;

  return (
    <>
      <SessionsView space="admin" sessions={sessions} start={start} offset={offset} now={now} />
      {sessionId && (
        <SessionDrawer sessionId={sessionId} user={user} now={now} closeHref={closeHref} />
      )}
    </>
  );
}
