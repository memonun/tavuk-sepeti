/**
 * How a set of reminders is laid out on the page. Pure.
 */
import { dueDay } from "@/features/reminders/domain/due";

import type { Reminder } from "@/features/reminders/domain/reminder";

export interface ReminderDayGroup {
  /** YYYY-MM-DD Istanbul day. */
  readonly day: string;
  readonly reminders: readonly Reminder[];
}

/** Due time first (undated last), then the order they were added. */
export function compareByDue(a: Reminder, b: Reminder): number {
  if (a.due_at === null || b.due_at === null) {
    if (a.due_at !== null) return -1;
    if (b.due_at !== null) return 1;
    return a.created_at.localeCompare(b.created_at);
  }
  const delta = new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
  if (delta !== 0) return delta;
  // Same instant: an all-day reminder sits above the timed ones of its day.
  if (a.due_all_day !== b.due_all_day) return a.due_all_day ? -1 : 1;
  return a.created_at.localeCompare(b.created_at);
}

/**
 * "Planlanan": dated reminders under one header per day, earliest day first.
 * Undated reminders have no place here and are dropped.
 */
export function groupByDueDay(reminders: readonly Reminder[]): ReminderDayGroup[] {
  const byDay = new Map<string, Reminder[]>();
  for (const reminder of [...reminders].sort(compareByDue)) {
    const day = dueDay(reminder);
    if (day === null) continue;
    const bucket = byDay.get(day);
    if (bucket) bucket.push(reminder);
    else byDay.set(day, [reminder]);
  }
  return [...byDay.entries()].map(([day, items]) => ({ day, reminders: items }));
}

export interface ReminderListGroup {
  readonly listId: string;
  readonly reminders: readonly Reminder[];
}

/**
 * "Tümü": reminders under one header per list, in the lists' own order. A
 * list with no open reminder still gets its (empty) section so something can
 * be added to it right there.
 */
export function groupByList(
  listIds: readonly string[],
  reminders: readonly Reminder[],
): ReminderListGroup[] {
  const byList = new Map<string, Reminder[]>(listIds.map((id) => [id, []]));
  for (const reminder of reminders) byList.get(reminder.list_id)?.push(reminder);
  return listIds.map((listId) => ({ listId, reminders: byList.get(listId) ?? [] }));
}
