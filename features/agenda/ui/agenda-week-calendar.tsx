/**
 * Monday–Sunday calendar. Server Component: one stacked card per day on a
 * phone, two columns on a tablet, a seven-column week on a wide screen. Each
 * day has its own "+" so a task can be added straight onto that date.
 */
import { AgendaAddTaskButton } from "@/features/agenda/ui/agenda-task-form";
import { AgendaTaskItem } from "@/features/agenda/ui/agenda-task-item";
import { formatDayMonth, formatWeekday } from "@/features/agenda/ui/agenda-format";
import { cn } from "@/lib/utils";

import type { AgendaCategory, AgendaTask } from "@/features/agenda/domain/agenda-task";
import type { AgendaWeek } from "@/features/agenda/domain/agenda-week";

export function AgendaWeekCalendar({
  week,
  today,
  tasksByDay,
  category,
}: {
  week: AgendaWeek;
  today: string;
  tasksByDay: ReadonlyMap<string, readonly AgendaTask[]>;
  /** Active category filter — pre-selected when adding from a day card. */
  category: AgendaCategory | null;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
      {week.days.map((day) => {
        const tasks = tasksByDay.get(day) ?? [];
        const isToday = day === today;
        const isPast = day < today;
        return (
          <section
            key={day}
            aria-label={`${formatWeekday(day)} ${formatDayMonth(day)}`}
            className={cn(
              "flex min-w-0 flex-col rounded-lg border bg-card text-card-foreground xl:min-h-40",
              isToday && "border-primary ring-1 ring-primary",
            )}
          >
            <header className="flex items-center justify-between gap-2 border-b px-2.5 py-1.5">
              <div className={cn("min-w-0", isPast && "text-muted-foreground")}>
                <span className="text-sm font-medium">{formatWeekday(day)}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">{formatDayMonth(day)}</span>
                {isToday ? (
                  <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                    Bugün
                  </span>
                ) : null}
              </div>
              <AgendaAddTaskButton
                iconOnly
                label={`${formatWeekday(day)} ${formatDayMonth(day)} için iş ekle`}
                defaultDueDate={day}
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
              <p className="px-2.5 py-2 text-xs text-muted-foreground">İş yok</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
