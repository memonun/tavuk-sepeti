import "server-only";

import { toIstanbulDateString } from "@/shared/utils/date";

/**
 * Calendar-day range presets for the Finans period filter. Same
 * Europe/Istanbul, YYYY-MM-DD string-space math as
 * features/orders/application/date-range-presets.ts, but with a distinct
 * preset set (Finans needs "this_year"; it has no "past" or "all" — a
 * finance report always has bounds) so it's its own small file rather than
 * a cross-feature import of an orders-shaped type.
 */
export type FinanceDateRangePreset =
  | "today"
  | "this_week"
  | "this_month"
  | "this_year"
  | "custom";

export interface FinanceDateBounds {
  from: string;
  to: string;
}

const PRESETS = new Set<FinanceDateRangePreset>([
  "today",
  "this_week",
  "this_month",
  "this_year",
  "custom",
]);

export function isFinanceDateRangePreset(
  value: unknown,
): value is FinanceDateRangePreset {
  return typeof value === "string" && PRESETS.has(value as FinanceDateRangePreset);
}

function ymdToUtcMidnight(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

function ymdFromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysYmd(ymd: string, n: number): string {
  const d = ymdToUtcMidnight(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return ymdFromUtc(d);
}

/**
 * Resolve a preset to from/to bounds. For `custom`, returns today/today as a
 * safe fallback — callers should prefer the explicit date_from/date_to
 * query params when range === "custom" (see finance-period-filter.tsx).
 */
export function getFinanceDateRangeBounds(
  preset: FinanceDateRangePreset,
  now: Date = new Date(),
): FinanceDateBounds {
  const today = toIstanbulDateString(now);

  switch (preset) {
    case "today":
      return { from: today, to: today };

    case "this_week": {
      // ISO week: Monday start. UTC dow: 0=Sun, 1=Mon, ..., 6=Sat.
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
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const last = `${y}-${monthStr}-${String(lastDay).padStart(2, "0")}`;
      return { from: first, to: last };
    }

    case "this_year": {
      const [y] = today.split("-");
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }

    case "custom":
      return { from: today, to: today };
  }
}
