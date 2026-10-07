/**
 * Display formatting for Ajanda's calendar days. Inputs are YYYY-MM-DD
 * Istanbul calendar days (not instants), so they're formatted as UTC
 * midnight in the UTC zone — the printed day can never shift, whatever the
 * server's or the phone's own timezone is.
 */
import type { AgendaWeek } from "@/features/agenda/domain/agenda-week";

const asUtcMidnight = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

const weekdayLong = new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", weekday: "long" });
const dayMonth = new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", day: "numeric", month: "short" });
const dayMonthYear = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "Pazartesi" */
export function formatWeekday(ymd: string): string {
  return weekdayLong.format(asUtcMidnight(ymd));
}

/** "6 Eki" */
export function formatDayMonth(ymd: string): string {
  return dayMonth.format(asUtcMidnight(ymd));
}

/** "6 Eki Salı" — for toasts and backlog rows. */
export function formatDayMonthWeekday(ymd: string): string {
  return `${formatDayMonth(ymd)} ${formatWeekday(ymd)}`;
}

/** "6 – 12 Eki 2026", or "29 Eyl – 5 Eki 2026" across a month boundary. */
export function formatWeekRange(week: AgendaWeek): string {
  return `${formatDayMonth(week.start)} – ${dayMonthYear.format(asUtcMidnight(week.end))}`;
}
