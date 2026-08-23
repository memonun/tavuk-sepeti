/**
 * Pure recurrence date math, anchored to the Europe/Istanbul calendar (fixed
 * UTC+3, no DST since 2016 — same property shared/utils/date.ts relies on).
 * All runs land at a fixed RUN_HOUR so a generated row's scheduled day is
 * unambiguous.
 *
 * Generalized out of features/recurring/domain/compute-next-run.ts (which
 * only ever needed weekly/biweekly/monthly) so Finance's recurring-expense
 * templates can reuse the exact same month-end clamping logic for
 * quarterly/6-monthly/yearly cadences without duplicating it. Interval knobs
 * default to 1, so passing no interval reproduces the original weekly/monthly
 * behavior exactly.
 *
 * Two operations:
 *  - firstRunOnOrAfter: the FIRST occurrence on/after a start day (template
 *    creation). For weekly this is the soonest matching weekday.
 *  - computeNextRunAt: ADVANCE one period strictly after a prior run instant
 *    (the generator passes the template's current next_run_at). Weekly
 *    self-corrects onto day_of_week; monthly uses day_of_month (clamped),
 *    not the prior run's day, so a Feb-clamped 28th still advances to the
 *    31st-ish the following cycle.
 */
import { addDaysToYmd, toIstanbulDateString } from "@/shared/utils/date";

export type RecurrenceCadenceKind = "weekly" | "monthly";

/** The day-anchor a cadence needs, plus how many weeks/months each period
 *  spans (both default to 1 — a plain weekly/monthly cadence). */
export interface RecurrenceShape {
  readonly dayOfWeek?: number | null;
  readonly dayOfMonth?: number | null;
  /** Weeks per period: 1 = weekly, 2 = biweekly. */
  readonly intervalWeeks?: number;
  /** Months per period: 1 = monthly, 3 = quarterly, 6 = 6-monthly, 12 = yearly. */
  readonly intervalMonths?: number;
}

/** Generation hour in Istanbul wall-clock (06:00). */
export const RUN_HOUR = 6;

/** Day-of-week of a YYYY-MM-DD (0=Sunday..6=Saturday) — matches the schema. */
function ymdDow(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

/** Days in a given month (1-based month). */
function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** The UTC instant whose Istanbul wall-clock is `ymd` at RUN_HOUR. */
function ymdAtRunHour(ymd: string): Date {
  const hh = String(RUN_HOUR).padStart(2, "0");
  return new Date(`${ymd}T${hh}:00:00+03:00`);
}

/** Monthly target day for a given year/month, clamped to the month's length. */
function monthlyYmd(year: number, month1: number, dayOfMonth: number): string {
  const day = Math.min(dayOfMonth, daysInMonth(year, month1));
  return `${String(year).padStart(4, "0")}-${String(month1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Adds `months` calendar months to a year/1-based-month pair. */
function addMonths(year: number, month1: number, months: number): { year: number; month1: number } {
  const zeroBased = month1 - 1 + months;
  return {
    year: year + Math.floor(zeroBased / 12),
    month1: ((zeroBased % 12) + 12) % 12 + 1,
  };
}

/**
 * First occurrence on OR AFTER `startYmd` (a YYYY-MM-DD Istanbul day), as the
 * UTC run instant. Used when a template is created.
 */
export function firstRunOnOrAfter(
  startYmd: string,
  cadence: RecurrenceCadenceKind,
  shape: RecurrenceShape,
): Date {
  if (cadence === "monthly") {
    const dom = shape.dayOfMonth ?? 1;
    const [y, m] = startYmd.split("-").map(Number) as [number, number];
    const thisMonth = monthlyYmd(y, m, dom);
    if (thisMonth >= startYmd) return ymdAtRunHour(thisMonth);
    const next = addMonths(y, m, shape.intervalMonths ?? 1);
    return ymdAtRunHour(monthlyYmd(next.year, next.month1, dom));
  }
  // weekly — soonest matching weekday on/after start.
  const target = shape.dayOfWeek ?? 0;
  const delta = (target - ymdDow(startYmd) + 7) % 7;
  return ymdAtRunHour(addDaysToYmd(startYmd, delta));
}

/**
 * Next run STRICTLY AFTER `from`. `from` is expected to be a prior occurrence
 * (the template's current next_run_at); the generator calls this to advance.
 */
export function computeNextRunAt(
  cadence: RecurrenceCadenceKind,
  shape: RecurrenceShape,
  from: Date,
): Date {
  const fromYmd = toIstanbulDateString(from);

  if (cadence === "monthly") {
    const dom = shape.dayOfMonth ?? 1;
    const [y, m] = fromYmd.split("-").map(Number) as [number, number];
    const next = addMonths(y, m, shape.intervalMonths ?? 1);
    return ymdAtRunHour(monthlyYmd(next.year, next.month1, dom));
  }

  // weekly: advance to the next matching weekday (self-correcting), then
  // (intervalWeeks - 1) extra weeks on top. From a date already on
  // day_of_week this is exactly +7*intervalWeeks.
  const target = shape.dayOfWeek ?? 0;
  let delta = (target - ymdDow(fromYmd) + 7) % 7;
  if (delta === 0) delta = 7;
  delta += ((shape.intervalWeeks ?? 1) - 1) * 7;
  return ymdAtRunHour(addDaysToYmd(fromYmd, delta));
}
