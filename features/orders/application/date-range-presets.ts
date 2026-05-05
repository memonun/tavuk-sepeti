import "server-only";

import { toIstanbulDateString } from "@/shared/utils/date";

/**
 * Calendar-day range presets for the order list filter.
 *
 * Boundaries are computed in Europe/Istanbul: an order scheduled for
 * 2026-05-06 (Istanbul) shouldn't drop in/out of "today" depending on
 * the server's clock. Math runs in YYYY-MM-DD string space anchored to
 * UTC midnight so we never accidentally apply a tz shift.
 */
export type DateRangePreset =
  | "today"
  | "this_week"
  | "this_month"
  | "past"
  | "all"
  | "custom";

export interface DateBounds {
  from: string | undefined;
  to: string | undefined;
}

const PRESETS = new Set<DateRangePreset>([
  "today",
  "this_week",
  "this_month",
  "past",
  "all",
  "custom",
]);

export function isDateRangePreset(value: unknown): value is DateRangePreset {
  return typeof value === "string" && PRESETS.has(value as DateRangePreset);
}

function ymdFromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function ymdToUtcMidnight(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

function addDaysYmd(ymd: string, n: number): string {
  const d = ymdToUtcMidnight(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return ymdFromUtc(d);
}

/**
 * Resolve a preset to scheduled_from / scheduled_to bounds.
 * For `custom`, returns no bounds — the caller should use the explicit
 * scheduled_from / scheduled_to query params.
 */
export function getDateRangeBounds(
  preset: DateRangePreset,
  now: Date = new Date(),
): DateBounds {
  const today = toIstanbulDateString(now);

  switch (preset) {
    case "today":
      return { from: today, to: today };

    case "this_week": {
      // ISO week: Monday start. UTC dow: 0=Sun, 1=Mon, ..., 6=Sat.
      // Days back to Monday: (dow + 6) % 7 (Sun→6, Mon→0, ..., Sat→5).
      const dow = ymdToUtcMidnight(today).getUTCDay();
      const daysFromMonday = (dow + 6) % 7;
      const monday = addDaysYmd(today, -daysFromMonday);
      const sunday = addDaysYmd(monday, 6);
      return { from: monday, to: sunday };
    }

    case "this_month": {
      const [y, m] = today.split("-").map(Number) as [number, number];
      const monthStr = String(m).padStart(2, "0");
      const first = `${y}-${monthStr}-01`;
      // Day 0 of next month = last day of this month.
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const last = `${y}-${monthStr}-${String(lastDay).padStart(2, "0")}`;
      return { from: first, to: last };
    }

    case "past":
      return { from: undefined, to: addDaysYmd(today, -1) };

    case "all":
    case "custom":
      return { from: undefined, to: undefined };
  }
}
