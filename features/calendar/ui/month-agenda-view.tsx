"use client";

/**
 * The month on a phone. Seven columns of a 375px screen leave ~50px per day —
 * not enough to print event titles — so the grid only marks WHICH days have
 * something (coloured dots), and the selected day's entries are listed
 * underneath at full width, large enough to read and tap. Everything the
 * desktop month grid does is still here: open an event, tick a reminder, jump
 * to the day's route, open the day view, start a new event on a day.
 */
import { MapPin, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { isSameMonth, type VisibleRange } from "@/features/calendar/domain/range";
import { DeliveryChip, ReminderChip } from "@/features/calendar/ui/calendar-chips";
import {
  calendarHref,
  dayNumber,
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

/** A day cell shows at most this many dots; more than that is just "busy". */
const MAX_DOTS = 3;

function eventTimeLabel(occurrence: EventOccurrence, day: string): string {
  if (occurrence.all_day) return "Tüm gün";
  // A timed event is "all-day-like" on the days it merely passes through.
  if (toIstanbulDateString(occurrence.starts_at) !== day) return "Devam ediyor";
  return `${formatHHmm(occurrence.starts_at)} – ${formatHHmm(occurrence.ends_at)}`;
}

export function MonthAgendaView({
  range,
  today,
  occurrencesByDay,
  remindersByDay,
  deliveriesByDay,
  colorOf,
  onCreate,
  onOpen,
  className,
}: {
  range: VisibleRange;
  today: string;
  occurrencesByDay: ReadonlyMap<string, readonly EventOccurrence[]>;
  remindersByDay: ReadonlyMap<string, readonly CalendarReminder[]>;
  deliveriesByDay: ReadonlyMap<string, DeliveryDay>;
  colorOf: (calendarId: string) => AccentColor;
  onCreate: (date: string) => void;
  onOpen: (occurrence: EventOccurrence) => void;
  className?: string;
}) {
  const [selected, setSelected] = useState(() =>
    range.days.includes(today) && isSameMonth(today, range.date) ? today : range.date,
  );

  const delivery = deliveriesByDay.get(selected);
  const occurrences = occurrencesByDay.get(selected) ?? [];
  const reminders = remindersByDay.get(selected) ?? [];
  const isEmpty = !delivery && occurrences.length === 0 && reminders.length === 0;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div aria-hidden className="grid grid-cols-7 border-b">
        {WEEKDAY_SHORT.map((weekday, index) => (
          <div
            key={weekday}
            className={cn(
              "py-1.5 text-center text-xs font-medium text-muted-foreground",
              index >= 5 && "text-muted-foreground/70",
            )}
          >
            {weekday}
          </div>
        ))}
      </div>

      <div className="grid shrink-0 grid-cols-7 border-b px-1 py-1">
        {range.days.map((day) => {
          const dots: string[] = [
            ...(occurrencesByDay.get(day) ?? []).map(
              (occurrence) => ACCENT_COLOR_HEX[colorOf(occurrence.calendar_id)],
            ),
            ...(remindersByDay.get(day) ?? []).map((reminder) => ACCENT_COLOR_HEX[reminder.color]),
          ];
          const hasDelivery = deliveriesByDay.has(day);
          const inMonth = isSameMonth(day, range.date);
          const isToday = day === today;
          const isSelected = day === selected;

          return (
            <button
              key={day}
              type="button"
              aria-label={longDay(day)}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              onClick={() => setSelected(day)}
              className="admin-tab flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full text-sm tabular-nums",
                  isSelected
                    ? "bg-primary font-semibold text-primary-foreground"
                    : isToday
                      ? "font-bold text-primary ring-2 ring-primary ring-inset"
                      : inMonth
                        ? "text-foreground"
                        : "text-muted-foreground/60",
                )}
              >
                {dayNumber(day)}
              </span>
              <span className="flex h-1.5 items-center gap-0.5">
                {hasDelivery ? (
                  <span className="size-1.5 rounded-[2px] bg-muted-foreground" />
                ) : null}
                {dots.slice(0, hasDelivery ? MAX_DOTS - 1 : MAX_DOTS).map((color, index) => (
                  <span
                    // Dots are decoration only and several can share a colour,
                    // so position is the only stable key.
                    key={index}
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-3">
        <div className="flex items-center justify-between gap-2 pb-2">
          <h3 className="text-base font-semibold">{longDay(selected)}</h3>
          <Link
            href={calendarHref("gun", selected)}
            className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Günü aç
          </Link>
        </div>

        {isEmpty ? (
          <p className="py-4 text-sm text-muted-foreground">Bu gün için kayıt yok.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {delivery ? (
              <li>
                <DeliveryChip
                  delivery={delivery}
                  className="min-h-12 gap-2 rounded-xl px-3 text-base text-foreground [&>svg]:size-5"
                />
              </li>
            ) : null}

            {occurrences.map((occurrence) => (
              <li key={occurrence.key}>
                <button
                  type="button"
                  onClick={() => onOpen(occurrence)}
                  className="admin-menu-row flex min-h-14 w-full items-stretch gap-3 rounded-xl border bg-background px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    aria-hidden
                    className="w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: ACCENT_COLOR_HEX[colorOf(occurrence.calendar_id)] }}
                  />
                  <span className="flex min-w-0 flex-1 flex-col justify-center">
                    <span className="text-base leading-snug font-medium [overflow-wrap:anywhere]">
                      {occurrence.title}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {eventTimeLabel(occurrence, selected)}
                    </span>
                    {occurrence.location ? (
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin aria-hidden className="size-3.5 shrink-0" />
                        <span className="truncate">{occurrence.location}</span>
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}

            {reminders.map((reminder) => (
              // A container, so the chip prints its time (see ReminderChip).
              <li key={reminder.id} className="@container">
                <ReminderChip
                  reminder={reminder}
                  className="min-h-12 gap-2.5 rounded-xl border bg-background px-3 text-base [&>button]:size-9 [&>button>span]:size-5 [&>button>span>span]:size-2.5 [&>span]:text-sm"
                />
              </li>
            ))}
          </ul>
        )}

        <Button
          type="button"
          variant="outline"
          className="mt-3 w-full gap-1.5"
          onClick={() => onCreate(selected)}
        >
          <Plus className="size-4" />
          Bu güne etkinlik ekle
        </Button>
      </div>
    </div>
  );
}
