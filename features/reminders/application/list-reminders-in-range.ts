import "server-only";

/**
 * The dated reminders of a time range, each with its list's name and color —
 * the read the Takvim page uses to show reminders on their days. This file is
 * the reminders feature's public API for that (CLAUDE.md §2: other features
 * import only from application/), so it exposes its own flat shape instead of
 * the domain entities.
 */
import { listReminderLists } from "@/features/reminders/infrastructure/reminder-list.repository";
import { listRemindersDueBetween } from "@/features/reminders/infrastructure/reminder.repository";
import { AppError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

import type { AccentColor } from "@/shared/palette/accent-colors";

export interface RangeReminder {
  readonly id: string;
  readonly title: string;
  /** ISO instant; all-day reminders carry their day's Istanbul midnight. */
  readonly due_at: string;
  readonly due_all_day: boolean;
  readonly completed: boolean;
  readonly list_id: string;
  readonly list_name: string;
  readonly color: AccentColor;
}

export interface RangeReminders {
  readonly reminders: readonly RangeReminder[];
  /** True when the range held more reminders than one read returns. */
  readonly truncated: boolean;
}

/** `from` inclusive, `to` exclusive — both ISO instants. */
export async function listRemindersInRange(
  from: string,
  to: string,
): Promise<Result<RangeReminders, AppError>> {
  const [remindersResult, listsResult] = await Promise.all([
    listRemindersDueBetween(from, to),
    listReminderLists(),
  ]);
  if (!remindersResult.ok) return err(remindersResult.error);
  if (!listsResult.ok) return err(listsResult.error);

  const lists = new Map(listsResult.value.map((list) => [list.id, list]));
  const reminders: RangeReminder[] = [];
  for (const reminder of remindersResult.value.items) {
    const list = lists.get(reminder.list_id);
    if (reminder.due_at === null || list === undefined) continue;
    reminders.push({
      id: reminder.id,
      title: reminder.title,
      due_at: reminder.due_at,
      due_all_day: reminder.due_all_day,
      completed: reminder.completed_at !== null,
      list_id: list.id,
      list_name: list.name,
      color: list.color,
    });
  }
  return ok({
    reminders,
    truncated: remindersResult.value.total > remindersResult.value.items.length,
  });
}
