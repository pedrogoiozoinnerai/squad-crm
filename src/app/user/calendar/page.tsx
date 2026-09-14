import { CalendarView } from "@/components/calendar/CalendarView";
import { requireUser } from "@/lib/auth";
import { weekStart } from "@/lib/dates";
import { getWeekMeetings } from "@/lib/queries";

export default async function CalendarPage(props: PageProps<"/user/calendar">) {
  const user = await requireUser("user");
  const { w } = await props.searchParams;

  const offset = Number(Array.isArray(w) ? w[0] : w) || 0;
  const start = weekStart(new Date(), offset);
  const meetings = await getWeekMeetings(user, start);

  return (
    <CalendarView
      space="user"
      meetings={meetings}
      start={start}
      offset={offset}
      showOwner={user.role === "ADMIN"}
    />
  );
}
