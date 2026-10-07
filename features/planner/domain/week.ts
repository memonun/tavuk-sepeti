/**
 * Pure, timezone-agnostic ISO-date (YYYY-MM-DD) week math for the planner
 * board. Self-contained on purpose (CLAUDE.md §2) rather than reusing
 * another feature's date helpers — the caller resolves "today" to
 * Europe/Istanbul (shared/utils/date.ts) and passes the result in here.
 */

const WEEKDAY_LABELS_TR = [
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
  "Pazar",
] as const;

/** Add (or subtract) whole days to a YYYY-MM-DD string. UTC math so
 *  there's no DST drift on a date-only value. */
export function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** The Monday (inclusive) of the ISO week containing `dateIso`. */
export function startOfIsoWeek(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const dow = dt.getUTCDay(); // 0=Sunday..6=Saturday
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  dt.setUTCDate(dt.getUTCDate() + diffToMonday);
  return dt.toISOString().slice(0, 10);
}

/** The 7 ISO dates (Mon..Sun) of the week starting at `mondayIso`. Does
 *  NOT verify `mondayIso` is actually a Monday — callers always derive
 *  it from `startOfIsoWeek` first. */
export function weekDays(mondayIso: string): readonly string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(mondayIso, i));
}

/** Turkish weekday label for a Mon..Sun index (0=Pazartesi..6=Pazar). */
export function weekdayLabel(index: number): string {
  return WEEKDAY_LABELS_TR[((index % 7) + 7) % 7] ?? "";
}
