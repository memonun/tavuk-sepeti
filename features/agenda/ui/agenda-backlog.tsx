/**
 * The two lists that live outside the calendar: open tasks whose day has
 * passed (Geciken) and open tasks with no date at all (Tarihsiz
 * yapılacaklar). Server Component.
 */
import { AlertTriangle, ListTodo } from "lucide-react";

import {
  AGENDA_CATEGORIES,
  AGENDA_CATEGORY_LABELS,
} from "@/features/agenda/domain/agenda-task";
import { AGENDA_CATEGORY_DOT } from "@/features/agenda/ui/agenda-category-style";
import { AgendaAddTaskButton } from "@/features/agenda/ui/agenda-task-form";
import { AgendaTaskItem } from "@/features/agenda/ui/agenda-task-item";
import { cn } from "@/lib/utils";

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

/**
 * Undated to-dos as a checklist per category: each category block lists its
 * open tasks and has its own "+" that pre-selects that category. With a
 * category filter active only that block is shown.
 */
export function AgendaUndatedList({
  tasks,
  category,
}: {
  tasks: readonly AgendaTask[];
  category: AgendaCategory | null;
}) {
  const categories = category === null ? AGENDA_CATEGORIES : [category];
  return (
    <section className="rounded-lg border bg-card text-card-foreground">
      <header className="flex items-center gap-1.5 border-b px-2.5 py-1.5 text-sm font-medium">
        <ListTodo aria-hidden className="h-4 w-4" />
        Yapılacaklar listesi{tasks.length > 0 ? ` (${tasks.length})` : ""}
      </header>
      <div className="divide-y">
        {categories.map((cat) => {
          const inCategory = tasks.filter((task) => task.category === cat);
          return (
            <div key={cat} className="px-1 py-1">
              <div className="flex items-center justify-between gap-2 px-1.5 py-0.5">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span
                    aria-hidden
                    className={cn("size-2 shrink-0 rounded-full", AGENDA_CATEGORY_DOT[cat])}
                  />
                  {AGENDA_CATEGORY_LABELS[cat]}
                  {inCategory.length > 0 ? ` (${inCategory.length})` : ""}
                </span>
                <AgendaAddTaskButton
                  iconOnly
                  label={`${AGENDA_CATEGORY_LABELS[cat]} için iş ekle`}
                  defaultCategory={cat}
                />
              </div>
              {inCategory.length > 0 ? (
                <ul className="flex flex-col">
                  {inCategory.map((task) => (
                    <AgendaTaskItem key={task.id} task={task} />
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
