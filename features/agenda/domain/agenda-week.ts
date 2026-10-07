/**
 * Weekly-calendar shaping for the Ajanda page. Pure — the application layer
 * fetches rows, these functions decide which week, which day column, and
 * which backlog bucket each task belongs to.
 *
 * Weeks run Monday → Sunday (Turkish convention). Dates are YYYY-MM-DD
 * Istanbul calendar days; Istanbul has no DST, so UTC-day math is exact.
 */
import { addDaysToYmd } from "@/shared/utils/date";

import type { AgendaTask } from "@/features/agenda/domain/agenda-task";

export interface AgendaWeek {
  /** Monday. */
  readonly start: string;
  /** Sunday. */
  readonly end: string;
  /** Monday … Sunday, seven entries. */
  readonly days: readonly string[];
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(ymd: string): number {
  const jsDay = new Date(`${ymd}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return (jsDay + 6) % 7;
}

export function weekContaining(ymd: string): AgendaWeek {
  const start = addDaysToYmd(ymd, -weekdayIndex(ymd));
  const days = Array.from({ length: 7 }, (_, i) => addDaysToYmd(start, i));
  return { start, end: days[6]!, days };
}

/** Monday of the week `weeks` away from the week containing `ymd`. */
export function shiftWeekStart(ymd: string, weeks: number): string {
  return addDaysToYmd(weekContaining(ymd).start, weeks * 7);
}

/** Open tasks first, then completed; each group oldest-created first, so a
 *  day's list doesn't reshuffle while the owner is ticking items off. */
export function compareTasksForList(a: AgendaTask, b: AgendaTask): number {
  const aDone = a.completed_at !== null;
  const bDone = b.completed_at !== null;
  if (aDone !== bDone) return aDone ? 1 : -1;
  return a.created_at.getTime() - b.created_at.getTime();
}

/** One sorted list per day of the week; tasks outside the week (or undated)
 *  are ignored. */
export function groupTasksByDay(
  tasks: readonly AgendaTask[],
  week: AgendaWeek,
): ReadonlyMap<string, readonly AgendaTask[]> {
  const byDay = new Map<string, AgendaTask[]>(week.days.map((d) => [d, []]));
  for (const task of tasks) {
    if (task.due_date === null) continue;
    byDay.get(task.due_date)?.push(task);
  }
  for (const list of byDay.values()) list.sort(compareTasksForList);
  return byDay;
}

export interface AgendaBacklog {
  /** Open, dated before today — oldest first. */
  readonly overdue: readonly AgendaTask[];
  /** Open, no date — newest first. */
  readonly undated: readonly AgendaTask[];
}

/** Splits open tasks into the two backlog panels. Completed tasks and tasks
 *  dated today or later belong to the calendar, not the backlog. */
export function splitBacklog(tasks: readonly AgendaTask[], today: string): AgendaBacklog {
  const overdue: AgendaTask[] = [];
  const undated: AgendaTask[] = [];
  for (const task of tasks) {
    if (task.completed_at !== null) continue;
    if (task.due_date === null) undated.push(task);
    else if (task.due_date < today) overdue.push(task);
  }
  overdue.sort(
    (a, b) =>
      (a.due_date! < b.due_date! ? -1 : a.due_date! > b.due_date! ? 1 : 0) ||
      a.created_at.getTime() - b.created_at.getTime(),
  );
  undated.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  return { overdue, undated };
}

export interface AgendaWeekSummary {
  /** Open tasks due today. */
  readonly openToday: number;
  /** Completed / all tasks dated inside the week. */
  readonly doneThisWeek: number;
  readonly totalThisWeek: number;
}

export function summarizeWeek(
  weekTasks: readonly AgendaTask[],
  week: AgendaWeek,
  today: string,
): AgendaWeekSummary {
  let openToday = 0;
  let doneThisWeek = 0;
  let totalThisWeek = 0;
  for (const task of weekTasks) {
    if (task.due_date === null || task.due_date < week.start || task.due_date > week.end) continue;
    totalThisWeek += 1;
    if (task.completed_at !== null) doneThisWeek += 1;
    else if (task.due_date === today) openToday += 1;
  }
  return { openToday, doneThisWeek, totalThisWeek };
}
