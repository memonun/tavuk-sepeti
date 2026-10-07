/**
 * Next-occurrence date math for recurring agenda tasks. Pure — the Server
 * Action (features/agenda/application/agenda-task-actions.ts) calls it when a
 * recurring task is ticked off and inserts the result as a new row.
 *
 * Rule: the series stays on its original cadence. The next date is the first
 * one in `due_date + k·interval` (k ≥ 1) that falls strictly AFTER today, so:
 *   - finishing on time or early → simply the next slot (Pzt → next Pzt);
 *   - finishing late → missed slots are skipped, never back-filled as
 *     already-overdue rows, and the weekday/day-of-month stays put.
 *
 * Months are counted from the task's own date in one jump (`due + k·n
 * months`, not one month at a time), and a 31st clamps to a short month's
 * last day: 31 Oca → 28 Şub. Each occurrence is its own row carrying its own
 * date, so the series then continues from the 28th.
 *
 * All inputs/outputs are YYYY-MM-DD Istanbul calendar days. Istanbul has no
 * DST, so UTC-day arithmetic is exact (see shared/utils/date.ts).
 */
import { addDaysToYmd, ymdDayDiff } from "@/shared/utils/date";

import type { RepeatRule } from "@/features/agenda/domain/agenda-task";

function parseYmd(ymd: string): { year: number; month: number; day: number } {
  const [year, month, day] = ymd.split("-").map(Number) as [number, number, number];
  return { year, month, day };
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** Adds calendar months, clamping the day to the target month's last day. */
export function addMonthsToYmd(ymd: string, months: number): string {
  const { year, month, day } = parseYmd(ymd);
  const monthIndex = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex - targetYear * 12; // 0-based
  // Day 0 of the following month is the last day of the target month.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${pad(targetYear, 4)}-${pad(targetMonth + 1, 2)}-${pad(Math.min(day, lastDay), 2)}`;
}

/** The k-th occurrence after `dueDate` (k = 0 is dueDate itself). */
export function occurrenceAt(dueDate: string, rule: RepeatRule, k: number): string {
  switch (rule.unit) {
    case "day":
      return addDaysToYmd(dueDate, k * rule.every);
    case "week":
      return addDaysToYmd(dueDate, k * rule.every * 7);
    case "month":
      return addMonthsToYmd(dueDate, k * rule.every);
  }
}

/** First occurrence of the series strictly after `today` (see file header). */
export function nextOccurrence(dueDate: string, rule: RepeatRule, today: string): string {
  if (rule.unit === "month") {
    const due = parseYmd(dueDate);
    const now = parseYmd(today);
    const monthsElapsed = now.year * 12 + now.month - (due.year * 12 + due.month);
    // Every occurrence before index floor(elapsed / every) lands in an earlier
    // month than today, so the answer is at most one or two steps past it.
    let k = Math.max(1, Math.floor(monthsElapsed / rule.every));
    while (occurrenceAt(dueDate, rule, k) <= today) k += 1;
    return occurrenceAt(dueDate, rule, k);
  }

  const stepDays = rule.unit === "week" ? rule.every * 7 : rule.every;
  const daysElapsed = ymdDayDiff(dueDate, today);
  const k = daysElapsed < 0 ? 1 : Math.floor(daysElapsed / stepDays) + 1;
  return addDaysToYmd(dueDate, k * stepDays);
}
