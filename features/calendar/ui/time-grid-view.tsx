"use client";

/**
 * The day and week views: a 24-hour grid with one column per day, events
 * placed by their time (overlapping ones side by side), an all-day strip on
 * top, and a red line where "now" is. Tapping an empty slot starts a new
 * event at that half hour.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  clipToDay,
  daySegments,
  layoutDaySegments,
  MIN_SEGMENT_MINUTES,
  MINUTES_PER_DAY,
  type DaySegment,
} from "@/features/calendar/domain/time-grid";
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
import {
  formatHHmm,
  istanbulMinutesOfDay,
  mondayIndexOfYmd,
  toIstanbulDateString,
} from "@/shared/utils/date";

import type {
  CalendarReminder,
  DeliveryDay,
  EventOccurrence,
} from "@/features/calendar/domain/calendar";
import type { VisibleRange } from "@/features/calendar/domain/range";

const HOUR_PX = 48;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
/** New events snap to this many minutes. */
const SLOT_MINUTES = 30;
/** The grid opens scrolled to this hour unless "now" is on screen. */
const OPEN_AT_HOUR = 7;

const NOW_COLOR = "#FF3B30";
const GRID_COLUMNS = "grid grid-cols-[3rem_minmax(0,1fr)]";

type GridItem =
  | { readonly kind: "event"; readonly occurrence: EventOccurrence }
  | { readonly kind: "reminder"; readonly reminder: CalendarReminder };

const pad = (n: number) => String(n).padStart(2, "0");
const minutesToHHmm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** "Now" as an Istanbul day + minute, re-read every minute. */
function useNow(initial: string): { day: string; minutes: number } {
  const [now, setNow] = useState(() => new Date(initial));
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, []);
  return { day: toIstanbulDateString(now), minutes: istanbulMinutesOfDay(now) };
}

export function TimeGridView({
  range,
  today,
  now,
  occurrencesByDay,
  remindersByDay,
  deliveriesByDay,
  colorOf,
  onCreate,
  onOpen,
}: {
  range: VisibleRange;
  today: string;
  now: string;
  occurrencesByDay: ReadonlyMap<string, readonly EventOccurrence[]>;
  remindersByDay: ReadonlyMap<string, readonly CalendarReminder[]>;
  deliveriesByDay: ReadonlyMap<string, DeliveryDay>;
  colorOf: (calendarId: string) => AccentColor;
  onCreate: (date: string, time: string) => void;
  onOpen: (occurrence: EventOccurrence) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const current = useNow(now);
  const showsToday = range.days.includes(current.day);

  // Open on the working morning, or around "now" when today is in view.
  const rangeStart = range.start;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = showsToday ? current.minutes - 90 : OPEN_AT_HOUR * 60;
    el.scrollTop = Math.max(0, (target / 60) * HOUR_PX);
    // Only when the visible days change — not every minute "now" moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, range.view]);

  const dayColumns = { gridTemplateColumns: `repeat(${range.days.length}, minmax(0, 1fr))` };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Day headers + all-day strip */}
      <div className={cn(GRID_COLUMNS, "border-b")}>
        <div />
        <div className="grid" style={dayColumns}>
          {range.days.map((day) => {
            const isToday = day === today;
            return (
              <div key={day} className="flex items-baseline justify-center gap-1.5 px-1 pt-1 pb-0.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {WEEKDAY_SHORT[mondayIndexOfYmd(day)]}
                </span>
                <Link
                  href={calendarHref("gun", day)}
                  aria-label={longDay(day)}
                  aria-current={isToday ? "date" : undefined}
                  className={cn(
                    "flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-base tabular-nums outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring",
                    isToday ? "bg-[#FF3B30] font-semibold text-white" : "hover:bg-muted",
                  )}
                >
                  {dayNumber(day)}
                </Link>
              </div>
            );
          })}
        </div>

        <div className="flex items-start justify-end pt-0.5 pr-1.5 text-[0.65rem] leading-5 whitespace-nowrap text-muted-foreground">
          tüm gün
        </div>
        <div className="grid max-h-28 overflow-y-auto" style={dayColumns}>
          {range.days.map((day) => {
            const delivery = deliveriesByDay.get(day);
            const occurrences = (occurrencesByDay.get(day) ?? []).filter((o) => o.all_day);
            const reminders = (remindersByDay.get(day) ?? []).filter((r) => r.due_all_day);
            return (
              <div key={day} className="flex min-h-6 min-w-0 flex-col gap-px border-l px-0.5 pb-1">
                {delivery ? <DeliveryChip delivery={delivery} /> : null}
                {occurrences.map((occurrence) => (
                  <button
                    key={occurrence.key}
                    type="button"
                    onClick={() => onOpen(occurrence)}
                    title={occurrence.title}
                    className="min-w-0 truncate rounded-[5px] px-1 text-left text-xs leading-5 font-medium outline-none transition-transform duration-100 ease-out active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring"
                    style={eventTintStyle(colorOf(occurrence.calendar_id))}
                  >
                    {occurrence.title}
                  </button>
                ))}
                {reminders.map((reminder) => (
                  <ReminderChip key={reminder.id} reminder={reminder} />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Hours */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className={cn(GRID_COLUMNS, "relative")} style={{ height: HOURS.length * HOUR_PX }}>
          <div aria-hidden className="relative">
            {HOURS.slice(1).map((hour) => (
              <span
                key={hour}
                className="absolute right-1.5 -translate-y-1/2 text-[0.65rem] text-muted-foreground tabular-nums"
                style={{ top: hour * HOUR_PX }}
              >
                {pad(hour)}:00
              </span>
            ))}
          </div>

          <div
            className="grid"
            style={{
              ...dayColumns,
              // Hour lines, drawn once behind every column.
              backgroundImage: "linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
              backgroundSize: `100% ${HOUR_PX}px`,
            }}
          >
            {range.days.map((day) => (
              <DayColumn
                key={day}
                day={day}
                occurrences={occurrencesByDay.get(day) ?? []}
                reminders={remindersByDay.get(day) ?? []}
                nowMinutes={day === current.day ? current.minutes : null}
                colorOf={colorOf}
                onCreate={onCreate}
                onOpen={onOpen}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DayColumn({
  day,
  occurrences,
  reminders,
  nowMinutes,
  colorOf,
  onCreate,
  onOpen,
}: {
  day: string;
  occurrences: readonly EventOccurrence[];
  reminders: readonly CalendarReminder[];
  /** Minutes since midnight when this column is today; else null. */
  nowMinutes: number | null;
  colorOf: (calendarId: string) => AccentColor;
  onCreate: (date: string, time: string) => void;
  onOpen: (occurrence: EventOccurrence) => void;
}) {
  const segments: DaySegment<GridItem>[] = [
    ...daySegments(occurrences, day).map((segment) => ({
      item: { kind: "event" as const, occurrence: segment.item },
      startMin: segment.startMin,
      endMin: segment.endMin,
    })),
    ...reminders.flatMap((reminder) => {
      if (reminder.due_all_day) return [];
      // A reminder is a moment, drawn as the shortest block the grid allows.
      const end = new Date(new Date(reminder.due_at).getTime() + MIN_SEGMENT_MINUTES * 60_000);
      const clipped = clipToDay(reminder.due_at, end.toISOString(), day);
      return clipped ? [{ item: { kind: "reminder" as const, reminder }, ...clipped }] : [];
    }),
  ];
  const placed = layoutDaySegments(segments);

  const createAt = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const minutes = ((event.clientY - rect.top) / HOUR_PX) * 60;
    const snapped = Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES;
    onCreate(day, minutesToHHmm(Math.min(MINUTES_PER_DAY - SLOT_MINUTES, Math.max(0, snapped))));
  };

  return (
    <div className="relative min-w-0 border-l">
      <button
        type="button"
        aria-label={`${longDay(day)}: etkinlik ekle`}
        onClick={createAt}
        className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      />

      {placed.map((segment) => {
        const top = (segment.startMin / 60) * HOUR_PX;
        const minutes = Math.max(segment.endMin - segment.startMin, MIN_SEGMENT_MINUTES);
        const box: React.CSSProperties = {
          top: top + 1,
          height: (minutes / 60) * HOUR_PX - 2,
          left: `calc(${(segment.column / segment.columns) * 100}% + 1px)`,
          width: `calc(${100 / segment.columns}% - 3px)`,
        };

        if (segment.item.kind === "reminder") {
          return (
            <div
              key={`r:${segment.item.reminder.id}`}
              className="absolute overflow-hidden rounded-md border border-dashed bg-background/90"
              style={box}
            >
              <ReminderChip reminder={segment.item.reminder} showTime={false} />
            </div>
          );
        }

        const { occurrence } = segment.item;
        const color = colorOf(occurrence.calendar_id);
        // What fits is decided by the block's height (48px per hour), never by
        // letting text clip: under an hour is one line, under 90 minutes drops
        // the location and the title's second line.
        const compact = minutes < 60;
        const roomy = minutes >= 90;
        return (
          <button
            key={occurrence.key}
            type="button"
            onClick={() => onOpen(occurrence)}
            title={occurrence.title}
            className={cn(
              // A container: a one-line block too narrow for both keeps the title.
              "@container absolute flex min-w-0 overflow-hidden rounded-md border-l-[3px] px-1.5 text-left text-xs outline-none",
              "transition-transform duration-100 ease-out active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring",
              compact ? "items-center gap-1.5" : "flex-col py-0.5",
            )}
            style={{ ...box, ...eventTintStyle(color), borderLeftColor: ACCENT_COLOR_HEX[color] }}
          >
            <span
              className={cn(
                "max-w-full min-w-0 font-medium",
                roomy ? "line-clamp-2 shrink-0" : "truncate",
                !compact && !roomy && "shrink-0",
              )}
            >
              {occurrence.title}
            </span>
            <span
              className={cn(
                "text-[0.68rem] opacity-80 tabular-nums",
                compact ? "hidden shrink-0 @min-[5.5rem]:inline" : "max-w-full truncate",
              )}
            >
              {formatHHmm(occurrence.starts_at)}
              {compact ? "" : ` – ${formatHHmm(occurrence.ends_at)}`}
            </span>
            {roomy && occurrence.location !== null ? (
              <span className="max-w-full truncate text-[0.68rem] opacity-80">
                {occurrence.location}
              </span>
            ) : null}
          </button>
        );
      })}

      {nowMinutes !== null ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
          style={{ top: (nowMinutes / 60) * HOUR_PX }}
        >
          <span className="-ml-1 size-2 -translate-y-1/2 rounded-full" style={{ backgroundColor: NOW_COLOR }} />
          <span className="h-px flex-1 -translate-y-1/2" style={{ backgroundColor: NOW_COLOR }} />
        </div>
      ) : null}
    </div>
  );
}
