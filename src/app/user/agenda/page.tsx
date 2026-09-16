import { addDays } from "date-fns";

import { AgendaView } from "@/components/agenda/AgendaView";
import { requireUser } from "@/lib/auth";
import { getAgenda, getOwners } from "@/lib/queries";

const BASE = "/user/agenda";

export default async function AgendaPage(props: PageProps<"/user/agenda">) {
  const user = await requireUser("user");
  const { d } = await props.searchParams;

  const offset = Number(Array.isArray(d) ? d[0] : d) || 0;
  const now = new Date();
  const day = addDays(now, offset);

  const { meetings, tasks } = await getAgenda(user, day);
  // Só o admin escolhe por quem marcar; o vendedor marca para si.
  const owners = user.role === "ADMIN" ? await getOwners() : undefined;

  return (
    <AgendaView
      meetings={meetings}
      tasks={tasks}
      day={day}
      offset={offset}
      basePath={BASE}
      now={now}
      owners={owners}
    />
  );
}
