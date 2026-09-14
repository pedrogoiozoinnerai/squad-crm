import { TasksView } from "@/components/tasks/TasksView";
import { requireUser } from "@/lib/auth";
import { getTasks } from "@/lib/queries";

export default async function TasksPage() {
  const user = await requireUser("admin");
  const tasks = await getTasks(user);

  return <TasksView tasks={tasks} showOwner={user.role === "ADMIN"} now={new Date()} />;
}
