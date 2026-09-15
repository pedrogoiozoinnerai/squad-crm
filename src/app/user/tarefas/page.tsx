import { TasksView } from "@/components/tasks/TasksView";
import { requireUser } from "@/lib/auth";
import { getTasks } from "@/lib/queries";

export default async function TasksPage() {
  const user = await requireUser("user");
  const { tasks, totais } = await getTasks(user);

  return <TasksView tasks={tasks} totais={totais} showOwner={user.role === "ADMIN"} now={new Date()} />;
}
