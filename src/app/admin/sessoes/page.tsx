import { addDays } from "date-fns";
import { redirect } from "next/navigation";

import { parseWeekOffset, SessionsView } from "@/components/sessions/SessionsView";
import { requireUser } from "@/lib/auth";
import { weekStart } from "@/lib/dates";
import { getOwners, getSessions } from "@/lib/queries";
import { configuracao } from "@/lib/reconciliar";

const BASE = "/admin/sessoes";

export default async function SessoesPage(props: PageProps<"/admin/sessoes">) {
  const user = await requireUser("admin");
  const { w, sessao } = await props.searchParams;

  // O detalhe da sessão virou página. `?sessao=` continua valendo porque ele
  // está em links que já foram mandados — e porque manter as duas telas
  // significaria decidir cada bloco duas vezes, que é exatamente como a taxa
  // de presença acabou em três cópias divergentes.
  const sessionId = Array.isArray(sessao) ? sessao[0] : sessao;
  if (sessionId) redirect(`${BASE}/${sessionId}`);

  const offset = parseWeekOffset(w);

  // `now` nasce aqui e desce como prop: componente puro não lê o relógio.
  const now = new Date();
  const start = weekStart(now, offset);
  const [sessions, regra, owners] = await Promise.all([
    getSessions(user, start, addDays(start, 7)),
    configuracao(),
    user.role === "ADMIN" ? getOwners() : Promise.resolve(undefined),
  ]);

  return (
    <SessionsView
      space="admin"
      sessions={sessions}
      start={start}
      offset={offset}
      now={now}
      minutosMinimos={regra.presencaMinutos}
      owners={owners}
    />
  );
}
