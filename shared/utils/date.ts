/**
 * Date / time formatting fixed to Europe/Istanbul + tr-TR.
 *
 * All persisted timestamps are `timestamptz` (UTC); the app layer formats
 * them in the operator's working timezone exactly once, here. CLAUDE.md §7.
 *
 * Accepts either a `Date` or an ISO string (what Supabase JSON returns).
 */
import { parseISO } from "date-fns";
import { tr } from "date-fns/locale/tr";
import { formatInTimeZone } from "date-fns-tz";

const TZ = "Europe/Istanbul";

function asDate(input: Date | string): Date {
  return typeof input === "string" ? parseISO(input) : input;
}

/** Default `5 May 2026` style for table cells, headers, etc. */
export function formatDate(input: Date | string): string {
  return formatInTimeZone(asDate(input), TZ, "d MMM yyyy", { locale: tr });
}

/** `5 May 2026, 14:30` — order timestamps, audit log rows. */
export function formatDateTime(input: Date | string): string {
  return formatInTimeZone(asDate(input), TZ, "d MMM yyyy, HH:mm", { locale: tr });
}

/** `Cuma, 5 May 2026` — used in the daily delivery route header. */
export function formatLongDate(input: Date | string): string {
  return formatInTimeZone(asDate(input), TZ, "EEEE, d MMM yyyy", { locale: tr });
}

/** ISO date (YYYY-MM-DD) in Europe/Istanbul — for `<input type="date">` values
 *  and `scheduled_for` columns where the app layer must commit a calendar day. */
export function toIstanbulDateString(input: Date | string): string {
  return formatInTimeZone(asDate(input), TZ, "yyyy-MM-dd");
}

/** `14:32` — Istanbul wall-clock time. Used for ETA chips on the route list. */
export function formatHHmm(input: Date | string): string {
  return formatInTimeZone(asDate(input), TZ, "HH:mm");
}

/**
 * Compares two YYYY-MM-DD date strings (both interpreted as Istanbul
 * calendar days) and returns the day delta: 0 = same, 1 = b is one day
 * after a, -1 = b is one day before a.
 *
 * Istanbul has no DST since 2016 and stays at UTC+3, so UTC-day arithmetic
 * matches Istanbul-day arithmetic exactly.
 */
export function ymdDayDiff(a: string, b: string): number {
  const aDate = new Date(`${a}T00:00:00Z`);
  const bDate = new Date(`${b}T00:00:00Z`);
  const ms = bDate.getTime() - aDate.getTime();
  return Math.round(ms / 86_400_000);
}

/** Adds (or subtracts) `days` to a YYYY-MM-DD string, returning another
 *  YYYY-MM-DD string in Istanbul-calendar terms. */
export function addDaysToYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Last calendar day of the month a YYYY-MM-DD falls in (`2026-09-04` →
 *  `2026-09-30`). Pure calendar math, so it is timezone-independent. */
export function endOfMonthYmd(ymd: string): string {
  const [year, month] = ymd.split("-").map(Number) as [number, number];
  // Day 0 of the NEXT month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** Today's date in Istanbul calendar, as YYYY-MM-DD. Convenience over
 *  `toIstanbulDateString(new Date())`. */
export function todayInIstanbul(): string {
  return toIstanbulDateString(new Date());
}

/** Adds calendar months to a YYYY-MM-DD, clamping the day to the target
 *  month's last day (`2026-01-31` + 1 → `2026-02-28`). */
export function addMonthsToYmd(ymd: string, months: number): string {
  const [year, month, day] = ymd.split("-").map(Number) as [number, number, number];
  const monthIndex = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex - targetYear * 12; // 0-based
  // Day 0 of the following month is the last day of the target month.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return `${pad(targetYear, 4)}-${pad(targetMonth + 1, 2)}-${pad(Math.min(day, lastDay), 2)}`;
}

/** The instant whose Istanbul wall-clock is `ymd` at `hhmm` (default midnight).
 *  Istanbul is a fixed UTC+3, so the offset is a constant. */
export function istanbulInstant(ymd: string, hhmm = "00:00"): Date {
  return new Date(`${ymd}T${hhmm}:00+03:00`);
}

/** Minutes since Istanbul midnight (0..1439) of an instant. */
export function istanbulMinutesOfDay(input: Date | string): number {
  const [hours, minutes] = formatHHmm(input).split(":").map(Number) as [number, number];
  return hours * 60 + minutes;
}

/** Day of week of a YYYY-MM-DD with Monday = 0 … Sunday = 6 (the week starts
 *  on Monday in Türkiye). */
export function mondayIndexOfYmd(ymd: string): number {
  return (new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** The Monday of the week a YYYY-MM-DD falls in. */
export function startOfWeekYmd(ymd: string): string {
  return addDaysToYmd(ymd, -mondayIndexOfYmd(ymd));
}

/** `2026-10-11` → `2026-10-01`. */
export function startOfMonthYmd(ymd: string): string {
  return `${ymd.slice(0, 8)}01`;
}
