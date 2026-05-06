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
