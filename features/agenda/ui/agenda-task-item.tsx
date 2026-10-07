"use client";

/**
 * One task row: a checkbox to tick it off, the title (tap → edit dialog),
 * and a meta line (category, repeat rule, date when outside the calendar).
 * The tick is optimistic so the list feels instant on a phone; the server's
 * revalidated page replaces it either way.
 */
import { Repeat, StickyNote } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { setAgendaTaskCompletedAction } from "@/features/agenda/application/agenda-task-actions";
import {
  AGENDA_CATEGORY_LABELS,
  describeRepeatRule,
  type AgendaTask,
} from "@/features/agenda/domain/agenda-task";
import { AGENDA_CATEGORY_DOT } from "@/features/agenda/ui/agenda-category-style";
import { formatDayMonthWeekday } from "@/features/agenda/ui/agenda-format";
import { AgendaTaskFormDialog } from "@/features/agenda/ui/agenda-task-form";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export function AgendaTaskItem({
  task,
  showDate = false,
  overdue = false,
}: {
  task: AgendaTask;
  /** Backlog rows aren't under a day header, so they print their own date. */
  showDate?: boolean;
  overdue?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setOptimisticDone] = useOptimistic(task.completed_at !== null);

  const toggle = (completed: boolean) => {
    startTransition(async () => {
      setOptimisticDone(completed);
      const result = await setAgendaTaskCompletedAction({ id: task.id, completed });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      if (result.value.next_due_date !== null) {
        toast.success(`Tamamlandı. Sonraki: ${formatDayMonthWeekday(result.value.next_due_date)}`);
      }
      router.refresh();
    });
  };

  return (
    <li className="flex items-start gap-1 rounded-md py-1 pr-1.5 hover:bg-muted/50">
      {/* 32px hit area around the 16px checkbox — it's tapped with a thumb. */}
      <label className="flex size-8 shrink-0 cursor-pointer items-center justify-center">
        <Checkbox
          checked={done}
          onCheckedChange={(checked) => toggle(checked === true)}
          disabled={pending}
          aria-label={done ? `${task.title}: tamamlanmadı olarak işaretle` : `${task.title}: tamamlandı`}
        />
      </label>
      <AgendaTaskFormDialog
        mode="edit"
        task={task}
        trigger={
          <button type="button" className="min-w-0 flex-1 py-1 text-left">
            <span
              className={cn(
                "block text-sm leading-snug break-words",
                done && "text-muted-foreground line-through",
              )}
            >
              {task.title}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span
                  aria-hidden
                  className={cn("size-2 shrink-0 rounded-full", AGENDA_CATEGORY_DOT[task.category])}
                />
                {AGENDA_CATEGORY_LABELS[task.category]}
              </span>
              {task.repeat !== null ? (
                <span className="inline-flex items-center gap-1">
                  <Repeat aria-hidden className="h-3 w-3" />
                  {describeRepeatRule(task.repeat)}
                </span>
              ) : null}
              {showDate && task.due_date !== null ? (
                <span className={cn(overdue && "font-medium text-destructive")}>
                  {formatDayMonthWeekday(task.due_date)}
                </span>
              ) : null}
              {task.notes !== null ? (
                <StickyNote aria-label="Notu var" className="h-3 w-3" />
              ) : null}
            </span>
          </button>
        }
      />
    </li>
  );
}
