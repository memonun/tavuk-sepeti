/**
 * Which days a calendar view shows, and where "previous" / "next" lead. Pure
 * YYYY-MM-DD math over Istanbul days; weeks start on Monday.
 */
import {
  addDaysToYmd,
  addMonthsToYmd,
  startOfMonthYmd,
  startOfWeekYmd,
} from "@/shared/utils/date";

import type { CalendarView } from "@/features/calendar/domain/calendar";

export interface VisibleRange {
  readonly view: CalendarView;
  /** The day the view is focused on (decides the month / week / day shown). */
  readonly date: string;
  /** First visible day. */
  readonly start: string;
  /** The day AFTER the last visible one (exclusive). */
  readonly end: string;
  readonly days: readonly string[];
}

/** A month is always drawn as six full weeks, so the grid never jumps in
 *  height between months. */
const MONTH_GRID_DAYS = 42;

const VIEW_DAYS: Readonly<Record<CalendarView, number>> = {
  ay: MONTH_GRID_DAYS,
  hafta: 7,
  gun: 1,
};

export function visibleRange(view: CalendarView, date: string): VisibleRange {
  const start =
    view === "ay"
      ? startOfWeekYmd(startOfMonthYmd(date))
      : view === "hafta"
        ? startOfWeekYmd(date)
        : date;
  const count = VIEW_DAYS[view];
  const days = Array.from({ length: count }, (_, i) => addDaysToYmd(start, i));
  return { view, date, start, end: addDaysToYmd(start, count), days };
}

/** The focused day one step back (-1) or forward (+1) in the given view.
 *  Month steps keep the day of the month, clamped (31 Oca → 28 Şub). */
export function shiftDate(view: CalendarView, date: string, direction: -1 | 1): string {
  if (view === "ay") return addMonthsToYmd(date, direction);
  return addDaysToYmd(date, direction * VIEW_DAYS[view]);
}

/** Whether `day` belongs to the month `date` is in (month grids dim the rest). */
export function isSameMonth(day: string, date: string): boolean {
  return day.slice(0, 7) === date.slice(0, 7);
}
