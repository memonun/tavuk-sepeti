/**
 * Resolve relative-date filter operators (bugün / bu hafta / bu ay / geçmiş /
 * gelecek) to half-open calendar bounds `[gte, lt)` in Europe/Istanbul, as
 * YYYY-MM-DD strings. Works for both date columns (scheduled_for) and
 * timestamptz columns (created_at) — PostgREST casts the bound to the column
 * type. The half-open shape avoids end-of-day boundary bugs.
 *
 * Week starts Monday (TR convention).
 */
import { addDaysToYmd, todayInIstanbul } from "@/shared/utils/date";

import type { FilterOperator } from "@/shared/filter/filter-rule";

export interface DateBounds {
  /** Inclusive lower bound (YYYY-MM-DD), if any. */
  readonly gte?: string;
  /** Exclusive upper bound (YYYY-MM-DD), if any. */
  readonly lt?: string;
}

/** Weekday of a YYYY-MM-DD calendar date, 0=Sunday … 6=Saturday. */
function weekday(ymd: string): number {
  // Parse as a fixed UTC instant; the calendar weekday is tz-independent.
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

function firstOfNextMonth(ymd: string): string {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7)); // 1-12
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;
}

export function resolveRelativeDateBounds(operator: FilterOperator): DateBounds {
  const today = todayInIstanbul(); // YYYY-MM-DD
  switch (operator) {
    case "is_today":
      return { gte: today, lt: addDaysToYmd(today, 1) };
    case "is_past":
      return { lt: today };
    case "is_future":
      return { gte: addDaysToYmd(today, 1) };
    case "is_this_week": {
      // Days since Monday: (weekday + 6) % 7 (Sun=0 → 6, Mon=1 → 0, …).
      const sinceMonday = (weekday(today) + 6) % 7;
      const monday = addDaysToYmd(today, -sinceMonday);
      return { gte: monday, lt: addDaysToYmd(monday, 7) };
    }
    case "is_this_month": {
      const first = `${today.slice(0, 7)}-01`;
      return { gte: first, lt: firstOfNextMonth(today) };
    }
    default:
      return {};
  }
}
