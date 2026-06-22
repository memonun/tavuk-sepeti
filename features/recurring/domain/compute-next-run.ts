/**
 * Pure next-run date math for recurring templates, anchored to the
 * Europe/Istanbul calendar (fixed UTC+3, no DST since 2016 — same property
 * shared/utils/date.ts relies on). All runs land at a fixed RUN_HOUR so a
 * generated order's scheduled day is unambiguous.
 *
 * Two operations:
 *  - firstRunOnOrAfter: the FIRST occurrence on/after a start day (template
 *    creation). For weekly/biweekly this is the soonest matching weekday.
 *  - computeNextRunAt: ADVANCE one period strictly after a prior run instant
 *    (the generator passes the template's current next_run_at). Weekly/biweekly
 *    self-correct onto day_of_week; monthly uses day_of_month (clamped), not
 *    the prior run's day, so a Feb-clamped 28th still advances to the 31st-ish.
 */
import { addDaysToYmd, toIstanbulDateString } from "@/shared/utils/date";

import type { RecurringCadence } from "@/features/recurring/domain/recurring-template";

/** The day-anchor a cadence needs: weekly/biweekly use dayOfWeek, monthly dayOfMonth. */
export interface CadenceShape {
  readonly dayOfWeek?: number | null;
  readonly dayOfMonth?: number | null;
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

/**
 * First occurrence on OR AFTER `startYmd` (a YYYY-MM-DD Istanbul day), as the
 * UTC run instant. Used when a template is created.
 */
export function firstRunOnOrAfter(
  startYmd: string,
  cadence: RecurringCadence,
  shape: CadenceShape,
): Date {
  if (cadence === "monthly") {
    const dom = shape.dayOfMonth ?? 1;
    const [y, m] = startYmd.split("-").map(Number) as [number, number];
    const thisMonth = monthlyYmd(y, m, dom);
    if (thisMonth >= startYmd) return ymdAtRunHour(thisMonth);
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    return ymdAtRunHour(monthlyYmd(nextY, nextM, dom));
  }
  // weekly | biweekly — soonest matching weekday on/after start.
  const target = shape.dayOfWeek ?? 0;
  const delta = (target - ymdDow(startYmd) + 7) % 7;
  return ymdAtRunHour(addDaysToYmd(startYmd, delta));
}

/**
 * Next run STRICTLY AFTER `from`. `from` is expected to be a prior occurrence
 * (the template's current next_run_at); the generator calls this to advance.
 */
export function computeNextRunAt(
  cadence: RecurringCadence,
  shape: CadenceShape,
  from: Date,
): Date {
  const fromYmd = toIstanbulDateString(from);

  if (cadence === "monthly") {
    const dom = shape.dayOfMonth ?? 1;
    const [y, m] = fromYmd.split("-").map(Number) as [number, number];
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    return ymdAtRunHour(monthlyYmd(nextY, nextM, dom));
  }

  // weekly/biweekly: advance to the next matching weekday (self-correcting),
  // then one extra week for biweekly. From a date already on day_of_week this
  // is exactly +7 (weekly) / +14 (biweekly).
  const target = shape.dayOfWeek ?? 0;
  let delta = (target - ymdDow(fromYmd) + 7) % 7;
  if (delta === 0) delta = 7;
  if (cadence === "biweekly") delta += 7;
  return ymdAtRunHour(addDaysToYmd(fromYmd, delta));
}
