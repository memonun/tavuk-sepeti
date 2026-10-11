"use client";

/**
 * One reminder, as in Apple Reminders: a round tick in the list's color, the
 * title editable right in place, a quiet meta line (notes, due date, repeat,
 * list) and — on the right — the flag and the "ayrıntılar" button.
 *
 * The tick and the flag are optimistic so the list answers the tap at once;
 * the server's revalidated page replaces them either way.
 */
import { Flag, Info, Repeat } from "lucide-react";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  setReminderCompletedAction,
  updateReminderAction,
} from "@/features/reminders/application/reminder-actions";
import { isOverdue } from "@/features/reminders/domain/due";
import {
  priorityMarks,
  type Reminder,
  type ReminderList,
} from "@/features/reminders/domain/reminder";
import { ReminderDetailDialog } from "@/features/reminders/ui/reminder-detail-dialog";
import { dueLabel } from "@/features/reminders/ui/reminder-format";
import { cn } from "@/lib/utils";
import { ACCENT_COLOR_HEX } from "@/shared/palette/accent-colors";
import { describeRepeatRule } from "@/shared/utils/repeat-rule";

const FLAG_COLOR = ACCENT_COLOR_HEX.orange;

export function ReminderRow({
  reminder,
  list,
  lists,
  today,
  now,
  showList = false,
}: {
  reminder: Reminder;
  /** The list this reminder belongs to (its color tints the tick). */
  list: ReminderList | undefined;
  lists: readonly ReminderList[];
  today: string;
  /** ISO instant the page was rendered at — the reference for "overdue". */
  now: string;
  /** Smart lists mix lists, so each row names its own. */
  showList?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setOptimisticDone] = useOptimistic(reminder.completed_at !== null);
  const [flagged, setOptimisticFlagged] = useOptimistic(reminder.flagged);
  const [detailOpen, setDetailOpen] = useState(false);
  const [title, setTitle] = useState(reminder.title);
  const inputRef = useRef<HTMLInputElement>(null);

  // A fresh title from the server (another admin's edit, or our own save)
  // replaces the local draft — render-phase adjustment, not an effect.
  const [seenTitle, setSeenTitle] = useState(reminder.title);
  if (seenTitle !== reminder.title) {
    setSeenTitle(reminder.title);
    setTitle(reminder.title);
  }

  const color = ACCENT_COLOR_HEX[list?.color ?? "blue"];
  const overdue = isOverdue(reminder, new Date(now));

  const toggleDone = () => {
    const completed = !done;
    startTransition(async () => {
      setOptimisticDone(completed);
      const result = await setReminderCompletedAction({ id: reminder.id, completed });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      if (result.value.next_due_at !== null) {
        toast.success(
          `Tamamlandı. Sonraki: ${dueLabel(
            { due_at: result.value.next_due_at, due_all_day: reminder.due_all_day },
            today,
          )}`,
        );
      }
      router.refresh();
    });
  };

  const toggleFlag = () => {
    const next = !flagged;
    startTransition(async () => {
      setOptimisticFlagged(next);
      const result = await updateReminderAction({ id: reminder.id, flagged: next });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      router.refresh();
    });
  };

  const commitTitle = () => {
    const trimmed = title.trim();
    if (trimmed === "" || trimmed === reminder.title) {
      setTitle(reminder.title);
      return;
    }
    startTransition(async () => {
      const result = await updateReminderAction({ id: reminder.id, title: trimmed });
      if (!result.ok) {
        toast.error(result.error.message);
        setTitle(reminder.title);
        return;
      }
      router.refresh();
    });
  };

  const marks = priorityMarks(reminder.priority);

  return (
    <li className="group/row flex items-start gap-1 pl-1">
      {/* 36px hit area around the 20px tick — it is tapped with a thumb. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `${reminder.title}: yeniden aç` : `${reminder.title}: tamamlandı`}
        onClick={toggleDone}
        disabled={pending}
        className="flex size-9 shrink-0 items-center justify-center rounded-full outline-none transition-transform duration-100 ease-out active:scale-90 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150",
            !done && "border-muted-foreground/45",
          )}
          style={done ? { borderColor: color } : undefined}
        >
          <span
            className={cn(
              "size-3 rounded-full transition-transform duration-150 ease-out",
              done ? "scale-100" : "scale-0",
            )}
            style={{ backgroundColor: color }}
          />
        </span>
      </button>

      <div className="flex min-w-0 flex-1 items-start gap-1 border-b py-1.5 pr-1 group-last/row:border-b-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1">
            {marks ? (
              <span aria-label="Öncelik" className="shrink-0 text-[0.95rem] font-semibold" style={{ color }}>
                {marks}
              </span>
            ) : null}
            <input
              ref={inputRef}
              aria-label="Başlık"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") inputRef.current?.blur();
                if (e.key === "Escape") {
                  setTitle(reminder.title);
                  // Blur after the state update so commitTitle sees the reset.
                  requestAnimationFrame(() => inputRef.current?.blur());
                }
              }}
              maxLength={200}
              className={cn(
                "w-full min-w-0 truncate bg-transparent text-[0.95rem] leading-6 outline-none",
                done && "text-muted-foreground",
              )}
            />
          </div>
          {reminder.notes !== null ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{reminder.notes}</p>
          ) : null}
          {reminder.due_at !== null || reminder.repeat !== null || showList ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
              {reminder.due_at !== null ? (
                <span className={cn(overdue && "text-destructive")}>
                  {dueLabel({ due_at: reminder.due_at, due_all_day: reminder.due_all_day }, today)}
                </span>
              ) : null}
              {reminder.repeat !== null ? (
                <span className="inline-flex items-center gap-1">
                  <Repeat aria-hidden className="size-3" />
                  {describeRepeatRule(reminder.repeat)}
                </span>
              ) : null}
              {showList && list ? (
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: color }} />
                  {list.name}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          aria-pressed={flagged}
          aria-label={flagged ? "Bayrağı kaldır" : "Bayrak ekle"}
          onClick={toggleFlag}
          disabled={pending}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md outline-none transition-[opacity,transform] duration-100 ease-out active:scale-90 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring",
            !flagged && "text-muted-foreground opacity-0 group-hover/row:opacity-100 pointer-coarse:opacity-60",
          )}
          style={flagged ? { color: FLAG_COLOR } : undefined}
        >
          <Flag className="size-4" fill={flagged ? "currentColor" : "none"} />
        </button>
        <button
          type="button"
          aria-label="Ayrıntılar"
          onClick={() => setDetailOpen(true)}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-[opacity,transform] duration-100 ease-out group-hover/row:opacity-100 active:scale-90 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:opacity-60"
        >
          <Info className="size-4" />
        </button>
      </div>

      <ReminderDetailDialog
        reminder={reminder}
        lists={lists}
        today={today}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </li>
  );
}
