"use client";

/**
 * The month grid: six Monday-first weeks, each day listing what happens on it
 * — deliveries, all-day events as filled bars, timed events as a colored dot
 * with their time, reminders with a tick. Tapping the empty part of a day
 * starts a new event there; the day number opens that day.
 */
import Link from "next/link";

import { isSameMonth, type VisibleRange } from "@/features/calendar/domain/range";
import { DeliveryChip, ReminderChip } from "@/features/calendar/ui/calendar-chips";
import {
  calendarHref,
  dayNumber,
  eventTintStyle,
  longDay,
  WEEKDAY_SHORT,
} from "@/features/calendar/ui/calendar-format";
import { cn } from "@/lib/utils";
import { ACCENT_COLOR_HEX, type AccentColor } from "@/shared/palette/accent-colors";
import { formatHHmm, toIstanbulDateString } from "@/shared/utils/date";

import type {
  CalendarReminder,
  DeliveryDay,
  EventOccurrence,
} from "@/features/calendar/domain/calendar";

/** A day shows this many lines; one more is spent on "+N daha" when it has more. */
const MAX_LINES = 4;

type DayLine =
  | { readonly kind: "delivery"; readonly key: string; readonly delivery: DeliveryDay }
  | { readonly kind: "event"; readonly key: string; readonly occurrence: EventOccurrence }
  | { readonly kind: "reminder"; readonly key: string; readonly reminder: CalendarReminder };

export function MonthView({
  range,
  today,
  occurrencesByDay,
  remindersByDay,
  deliveriesByDay,
  colorOf,
  onCreate,
  onOpen,
}: {
  range: VisibleRange;
  today: string;
  occurrencesByDay: ReadonlyMap<string, readonly EventOccurrence[]>;
  remindersByDay: ReadonlyMap<string, readonly CalendarReminder[]>;
  deliveriesByDay: ReadonlyMap<string, DeliveryDay>;
  colorOf: (calendarId: string) => AccentColor;
  onCreate: (date: string) => void;
  onOpen: (occurrence: EventOccurrence) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div aria-hidden className="grid grid-cols-7 border-b">
        {WEEKDAY_SHORT.map((weekday, index) => (
          <div
            key={weekday}
            className={cn(
              "px-2 py-1 text-right text-xs font-medium text-muted-foreground",
              index >= 5 && "text-muted-foreground/70",
            )}
          >
            {weekday}
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {range.days.map((day, index) => {
          const delivery = deliveriesByDay.get(day);
          const lines: DayLine[] = [
            ...(delivery ? [{ kind: "delivery" as const, key: "delivery", delivery }] : []),
            ...(occurrencesByDay.get(day) ?? []).map((occurrence) => ({
              kind: "event" as const,
              key: occurrence.key,
              occurrence,
            })),
            ...(remindersByDay.get(day) ?? []).map((reminder) => ({
              kind: "reminder" as const,
              key: reminder.id,
              reminder,
            })),
          ];
          const visible = lines.length > MAX_LINES ? lines.slice(0, MAX_LINES - 1) : lines;
          const hidden = lines.length - visible.length;
          const inMonth = isSameMonth(day, range.date);
          const isToday = day === today;
          const isWeekend = index % 7 >= 5;

          return (
            <div
              key={day}
              className={cn(
                // A container, so chips can drop their time when the day is narrow.
                "@container relative min-h-0 min-w-0 overflow-hidden border-r border-b [&:nth-child(7n)]:border-r-0",
                isWeekend && "bg-muted/30",
              )}
            >
              <button
                type="button"
                aria-label={`${longDay(day)}: etkinlik ekle`}
                onClick={() => onCreate(day)}
                className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              />
              <div className="pointer-events-none relative flex h-full flex-col gap-px p-1">
                <div className="flex justify-end">
                  <Link
                    href={calendarHref("gun", day)}
                    aria-label={longDay(day)}
                    aria-current={isToday ? "date" : undefined}
                    className={cn(
                      "pointer-events-auto flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums outline-none",
                      "focus-visible:ring-2 focus-visible:ring-ring",
                      isToday
                        ? "bg-[#FF3B30] font-semibold text-white"
                        : inMonth
                          ? "hover:bg-muted"
                          : "text-muted-foreground/60 hover:bg-muted",
                    )}
                  >
                    {dayNumber(day)}
                  </Link>
                </div>

                {visible.map((line) => {
                  if (line.kind === "delivery") {
                    return (
                      <DeliveryChip key={line.key} delivery={line.delivery} className="pointer-events-auto" />
                    );
                  }
                  if (line.kind === "reminder") {
                    return (
                      <ReminderChip key={line.key} reminder={line.reminder} className="pointer-events-auto" />
                    );
                  }
                  const { occurrence } = line;
                  const color = colorOf(occurrence.calendar_id);
                  // A timed event is "all-day-like" on the days it merely passes through.
                  const startsToday = toIstanbulDateString(occurrence.starts_at) === day;
                  const asBar = occurrence.all_day || !startsToday;
                  return (
                    <button
                      key={line.key}
                      type="button"
                      onClick={() => onOpen(occurrence)}
                      title={occurrence.title}
                      className={cn(
                        "pointer-events-auto flex min-w-0 items-center gap-1 rounded-[5px] px-1 text-left text-xs leading-5 outline-none",
                        "transition-transform duration-100 ease-out active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring",
                        asBar ? "font-medium" : "hover:bg-muted",
                      )}
                      style={asBar ? eventTintStyle(color) : undefined}
                    >
                      {!asBar ? (
                        <span
                          aria-hidden
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: ACCENT_COLOR_HEX[color] }}
                        />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate">{occurrence.title}</span>
                      {!asBar ? (
                        <span className="hidden shrink-0 text-[0.68rem] text-muted-foreground tabular-nums @min-[6.5rem]:inline">
                          {formatHHmm(occurrence.starts_at)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}

                {hidden > 0 ? (
                  <Link
                    href={calendarHref("gun", day)}
                    className="pointer-events-auto rounded-[5px] px-1 text-xs leading-5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    +{hidden} daha
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
