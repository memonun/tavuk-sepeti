/**
 * The two lists that live outside the calendar: open tasks whose day has
 * passed (Geciken) and open tasks with no date at all (Tarihsiz
 * yapılacaklar). Server Component.
 */
import { AlertTriangle, ListTodo } from "lucide-react";

import { AgendaAddTaskButton } from "@/features/agenda/ui/agenda-task-form";
import { AgendaTaskItem } from "@/features/agenda/ui/agenda-task-item";

import type { AgendaCategory, AgendaTask } from "@/features/agenda/domain/agenda-task";

export function AgendaOverdueList({ tasks }: { tasks: readonly AgendaTask[] }) {
  if (tasks.length === 0) return null;
  return (
    <section className="rounded-lg border border-destructive/40 bg-destructive/5">
      <header className="flex items-center gap-1.5 border-b border-destructive/20 px-2.5 py-1.5 text-sm font-medium text-destructive">
        <AlertTriangle aria-hidden className="h-4 w-4" />
        Geciken işler ({tasks.length})
      </header>
      <ul className="flex flex-col px-1 py-1">
        {tasks.map((task) => (
          <AgendaTaskItem key={task.id} task={task} showDate overdue />
        ))}
      </ul>
    </section>
  );
}

export function AgendaUndatedList({
  tasks,
  category,
}: {
  tasks: readonly AgendaTask[];
  category: AgendaCategory | null;
}) {
  return (
    <section className="rounded-lg border bg-card text-card-foreground">
      <header className="flex items-center justify-between gap-2 border-b px-2.5 py-1.5">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <ListTodo aria-hidden className="h-4 w-4" />
          Tarihsiz yapılacaklar{tasks.length > 0 ? ` (${tasks.length})` : ""}
        </span>
        <AgendaAddTaskButton
          iconOnly
          label="Tarihsiz iş ekle"
          defaultCategory={category ?? undefined}
        />
      </header>
      {tasks.length > 0 ? (
        <ul className="flex flex-col px-1 py-1">
          {tasks.map((task) => (
            <AgendaTaskItem key={task.id} task={task} />
          ))}
        </ul>
      ) : (
        <p className="px-2.5 py-2 text-xs text-muted-foreground">
          Belirli bir günü olmayan işler burada durur (ör. &quot;yeni yem tedarikçisi bul&quot;).
        </p>
      )}
    </section>
  );
}
