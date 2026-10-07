"use client";

/**
 * Personal weekly planner board — 7 day columns (Pzt..Paz) plus a
 * "Bekleyen" (unscheduled/backlog) column. Entirely owner-facing; nothing
 * here touches orders, customers or routes.
 *
 * Each column has its own quick-add input; a task's date can be changed
 * inline (a plain `<input type="date">`), which is the whole "move it to
 * another day" interaction — no drag-and-drop for a first version.
 */
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createPlannerTaskAction } from "@/features/planner/application/create-planner-task";
import { deletePlannerTaskAction } from "@/features/planner/application/delete-planner-task";
import { updatePlannerTaskAction } from "@/features/planner/application/update-planner-task";
import {
  addDaysIso,
  startOfIsoWeek,
  weekDays,
  weekdayLabel,
} from "@/features/planner/domain/week";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { todayInIstanbul } from "@/shared/utils/date";

import type { PlannerTask } from "@/features/planner/domain/task";

interface PlannerWeekViewProps {
  readonly weekStartIso: string;
  readonly scheduled: readonly PlannerTask[];
  readonly backlog: readonly PlannerTask[];
}

function shortDayLabel(dateIso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${dateIso}T00:00:00Z`));
}

export function PlannerWeekView({
  weekStartIso,
  scheduled,
  backlog,
}: PlannerWeekViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const today = todayInIstanbul();
  const days = weekDays(weekStartIso);
  const isCurrentWeek = weekStartIso === startOfIsoWeek(today);

  const goToWeek = (nextMondayIso: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("week", nextMondayIso);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  };

  const refresh = () => router.refresh();

  const handleCreate = (title: string, scheduledDate: string | null) => {
    startTransition(async () => {
      const result = await createPlannerTaskAction({
        title,
        scheduled_date: scheduledDate,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      refresh();
    });
  };

  const handleToggle = (task: PlannerTask) => {
    startTransition(async () => {
      const result = await updatePlannerTaskAction({
        id: task.id,
        status: task.status === "done" ? "open" : "done",
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      refresh();
    });
  };

  const handleReschedule = (task: PlannerTask, date: string | null) => {
    startTransition(async () => {
      const result = await updatePlannerTaskAction({
        id: task.id,
        scheduled_date: date ?? "",
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      refresh();
    });
  };

  const handleDelete = (task: PlannerTask) => {
    startTransition(async () => {
      const result = await deletePlannerTaskAction(task.id);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      refresh();
    });
  };

  const tasksFor = (date: string) => scheduled.filter((t) => t.scheduledDate === date);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => goToWeek(addDaysIso(weekStartIso, -7))}
            disabled={pending}
            aria-label="Önceki hafta"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium">
            {shortDayLabel(days[0] ?? weekStartIso)} – {shortDayLabel(days[6] ?? weekStartIso)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => goToWeek(addDaysIso(weekStartIso, 7))}
            disabled={pending}
            aria-label="Sonraki hafta"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        {!isCurrentWeek ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => goToWeek(startOfIsoWeek(today))}
            disabled={pending}
          >
            Bu hafta
          </Button>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-fr gap-2 overflow-x-auto sm:grid-cols-4 lg:grid-cols-8">
        {days.map((date, i) => (
          <TaskColumn
            key={date}
            title={weekdayLabel(i)}
            subtitle={shortDayLabel(date)}
            isToday={date === today}
            tasks={tasksFor(date)}
            pending={pending}
            onCreate={(title) => handleCreate(title, date)}
            onToggle={handleToggle}
            onReschedule={handleReschedule}
            onDelete={handleDelete}
          />
        ))}
        <TaskColumn
          title="Bekleyen"
          subtitle="tarihsiz"
          tasks={backlog}
          pending={pending}
          onCreate={(title) => handleCreate(title, null)}
          onToggle={handleToggle}
          onReschedule={handleReschedule}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}

interface TaskColumnProps {
  readonly title: string;
  readonly subtitle: string;
  readonly isToday?: boolean;
  readonly tasks: readonly PlannerTask[];
  readonly pending: boolean;
  readonly onCreate: (title: string) => void;
  readonly onToggle: (task: PlannerTask) => void;
  readonly onReschedule: (task: PlannerTask, date: string | null) => void;
  readonly onDelete: (task: PlannerTask) => void;
}

function TaskColumn({
  title,
  subtitle,
  isToday,
  tasks,
  pending,
  onCreate,
  onToggle,
  onReschedule,
  onDelete,
}: TaskColumnProps) {
  const [draft, setDraft] = useState("");

  return (
    <div
      className={cn(
        "flex min-w-[180px] flex-col gap-1.5 rounded-xl border p-2",
        isToday ? "border-primary/50 bg-primary/5" : "border-border/60 bg-card",
      )}
    >
      <div className="flex items-baseline justify-between gap-1">
        <p className={cn("text-xs font-semibold", isToday && "text-primary")}>{title}</p>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">—</p>
        ) : null}
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            pending={pending}
            onToggle={onToggle}
            onReschedule={onReschedule}
            onDelete={onDelete}
          />
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const title = draft.trim();
          if (!title) return;
          onCreate(title);
          setDraft("");
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="+ görev ekle"
          disabled={pending}
          className="h-7 text-xs"
        />
      </form>
    </div>
  );
}

interface TaskRowProps {
  readonly task: PlannerTask;
  readonly pending: boolean;
  readonly onToggle: (task: PlannerTask) => void;
  readonly onReschedule: (task: PlannerTask, date: string | null) => void;
  readonly onDelete: (task: PlannerTask) => void;
}

function TaskRow({ task, pending, onToggle, onReschedule, onDelete }: TaskRowProps) {
  const done = task.status === "done";
  return (
    <div className="group flex items-start gap-1.5 rounded-lg border border-border/60 bg-background px-1.5 py-1 text-xs">
      <input
        type="checkbox"
        checked={done}
        onChange={() => onToggle(task)}
        disabled={pending}
        className="mt-0.5 size-3.5 shrink-0 accent-primary"
        aria-label={done ? "Tamamlandı — geri aç" : "Tamamlandı olarak işaretle"}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("leading-snug break-words", done && "text-muted-foreground line-through")}>
          {task.title}
        </p>
        {task.notes ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground break-words">{task.notes}</p>
        ) : null}
        {/* Hidden until hover/focus — the date control is a secondary action,
            not something every row needs to show all the time. */}
        <div className="mt-1 flex items-center gap-1 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
          <input
            type="date"
            value={task.scheduledDate ?? ""}
            onChange={(e) => onReschedule(task, e.target.value || null)}
            disabled={pending}
            aria-label="Günü değiştir"
            className="h-5 rounded border border-input bg-transparent px-1 text-[10px]"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => onDelete(task)}
        disabled={pending}
        aria-label="Görevi sil"
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
