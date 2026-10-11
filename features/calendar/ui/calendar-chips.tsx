"use client";

/**
 * The small pieces a day shows besides events: a dated reminder (tick it off
 * right from the calendar) and the day's route deliveries. Both belong to
 * other features and are reached only through their application layer / their
 * own pages.
 */
import { Truck } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { setReminderCompletedAction } from "@/features/reminders/application/reminder-actions";
import { cn } from "@/lib/utils";
import { ACCENT_COLOR_HEX } from "@/shared/palette/accent-colors";
import { formatHHmm } from "@/shared/utils/date";

import type { CalendarReminder, DeliveryDay } from "@/features/calendar/domain/calendar";

export function ReminderChip({
  reminder,
  showTime = true,
  className,
}: {
  reminder: CalendarReminder;
  /** Month cells print the time; the time grid already places it. */
  showTime?: boolean;
  className?: string | undefined;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setOptimisticDone] = useOptimistic(reminder.completed);
  const color = ACCENT_COLOR_HEX[reminder.color];

  const toggle = () => {
    const completed = !done;
    startTransition(async () => {
      setOptimisticDone(completed);
      const result = await setReminderCompletedAction({ id: reminder.id, completed });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <span className={cn("flex min-w-0 items-center gap-1 rounded-[5px] px-1 text-xs leading-5", className)}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `${reminder.title}: yeniden aç` : `${reminder.title}: tamamlandı`}
        onClick={toggle}
        disabled={pending}
        className="flex size-4 shrink-0 items-center justify-center rounded-full outline-none transition-transform duration-100 ease-out active:scale-90 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className="flex size-3 items-center justify-center rounded-full border-[1.5px]"
          style={{ borderColor: color }}
        >
          {done ? <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} /> : null}
        </span>
      </button>
      <Link
        href={`/animsaticilar?liste=${reminder.list_id}`}
        title={`${reminder.title} — ${reminder.list_name}`}
        className={cn(
          "min-w-0 flex-1 truncate outline-none hover:underline focus-visible:underline",
          done && "text-muted-foreground line-through",
        )}
      >
        {reminder.title}
      </Link>
      {showTime && !reminder.due_all_day ? (
        // Only month cells print the time, and they are containers: on a
        // narrow day the title keeps the room.
        <span className="hidden shrink-0 text-[0.68rem] text-muted-foreground tabular-nums @min-[6.5rem]:inline">
          {formatHHmm(reminder.due_at)}
        </span>
      ) : null}
    </span>
  );
}

export function DeliveryChip({
  delivery,
  className,
}: {
  delivery: DeliveryDay;
  className?: string | undefined;
}) {
  const allDone = delivery.delivered === delivery.total;
  return (
    <Link
      href={`/routes?date=${delivery.day}`}
      title={`${delivery.total} teslimat, ${delivery.delivered} tamamlandı — rotayı aç`}
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-[5px] bg-muted px-1 text-xs leading-5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Truck aria-hidden className="size-3 shrink-0" />
      <span className="truncate">
        {delivery.total} teslimat
        {delivery.delivered > 0 ? (allDone ? " ✓" : ` · ${delivery.delivered} tamam`) : ""}
      </span>
    </Link>
  );
}
