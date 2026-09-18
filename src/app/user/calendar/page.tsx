import { CalendarView } from "@/components/calendar/CalendarView";
import { requireUser } from "@/lib/auth";
import { weekStart } from "@/lib/dates";
import { getOwners, getWeekMeetings } from "@/lib/queries";

export default async function CalendarPage(props: PageProps<"/user/calendar">) {
  const user = await requireUser("user");
  const { w } = await props.searchParams;

  const offset = Number(Array.isArray(w) ? w[0] : w) || 0;
  // Um relógio só, aqui, descendo como prop — a regra do projeto.
  const agora = new Date();
  const start = weekStart(agora, offset);
  const meetings = await getWeekMeetings(user, start);
  const owners = user.role === "ADMIN" ? await getOwners() : undefined;

  return (
    <CalendarView
      space="user"
      meetings={meetings}
      start={start}
      offset={offset}
      agora={agora}
      owners={owners}
    />
  );
}
