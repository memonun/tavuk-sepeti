/**
 * A reminder's due moment, in the two shapes the app needs: the stored pair
 * (`due_at` instant + `due_all_day`) and the form's pair (an Istanbul day +
 * an optional HH:mm). Pure; the timezone conversion lives here once.
 */
import {
  formatHHmm,
  istanbulInstant,
  toIstanbulDateString,
} from "@/shared/utils/date";

import type { Reminder } from "@/features/reminders/domain/reminder";

export interface DueParts {
  /** YYYY-MM-DD Istanbul day; null = no date. */
  readonly date: string | null;
  /** HH:mm Istanbul time; null = all day. Never set without a date. */
  readonly time: string | null;
}

export interface StoredDue {
  readonly due_at: string | null;
  readonly due_all_day: boolean;
}

export function dueFromParts(parts: DueParts): StoredDue {
  if (parts.date === null) return { due_at: null, due_all_day: true };
  if (parts.time === null) {
    return { due_at: istanbulInstant(parts.date).toISOString(), due_all_day: true };
  }
  return { due_at: istanbulInstant(parts.date, parts.time).toISOString(), due_all_day: false };
}

export function dueParts(due: StoredDue): DueParts {
  if (due.due_at === null) return { date: null, time: null };
  return {
    date: toIstanbulDateString(due.due_at),
    time: due.due_all_day ? null : formatHHmm(due.due_at),
  };
}

/** The Istanbul day a reminder is due on, or null when it has no date. */
export function dueDay(reminder: Pick<Reminder, "due_at">): string | null {
  return reminder.due_at === null ? null : toIstanbulDateString(reminder.due_at);
}

/**
 * Whether an open reminder is past due. An all-day reminder is only overdue
 * once its whole day has passed; a timed one the moment its time has.
 */
export function isOverdue(
  reminder: Pick<Reminder, "due_at" | "due_all_day" | "completed_at">,
  now: Date,
): boolean {
  if (reminder.completed_at !== null || reminder.due_at === null) return false;
  if (reminder.due_all_day) {
    return toIstanbulDateString(reminder.due_at) < toIstanbulDateString(now);
  }
  return new Date(reminder.due_at).getTime() < now.getTime();
}
