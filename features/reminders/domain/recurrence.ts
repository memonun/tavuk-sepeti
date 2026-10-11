/**
 * Where a repeating reminder goes when it is ticked off. Pure — the Server
 * Action (features/reminders/application/reminder-actions.ts) inserts the
 * result as a new row.
 *
 * The series stays on its own cadence (shared/utils/repeat-rule.ts): the next
 * occurrence is the first one after the completed row's day that has not
 * already gone by, so finishing late skips the missed slots instead of
 * creating reminders that are born overdue. The time of day carries over.
 *
 * "Gone by" follows isOverdue: an all-day occurrence must fall after today; a
 * timed one only needs its moment to still be ahead — a daily 18:00 reminder
 * for yesterday that is ticked off this morning comes back for today 18:00.
 */
import { dueFromParts, dueParts, type StoredDue } from "@/features/reminders/domain/due";
import { istanbulInstant, toIstanbulDateString } from "@/shared/utils/date";
import {
  firstOccurrenceIndexOnOrAfter,
  occurrenceYmd,
  type RepeatRule,
} from "@/shared/utils/repeat-rule";

export function nextReminderDue(
  due: { readonly due_at: string; readonly due_all_day: boolean },
  rule: RepeatRule,
  now: Date,
): StoredDue {
  const { date, time } = dueParts(due);
  // due_at is non-null, so dueParts always yields a day.
  const anchor = date ?? toIstanbulDateString(due.due_at);
  const today = toIstanbulDateString(now);

  let k = Math.max(1, firstOccurrenceIndexOnOrAfter(anchor, rule, today));
  const hasPassed = (ymd: string): boolean =>
    time === null ? ymd <= today : istanbulInstant(ymd, time).getTime() <= now.getTime();
  while (hasPassed(occurrenceYmd(anchor, rule, k))) k += 1;

  return dueFromParts({ date: occurrenceYmd(anchor, rule, k), time });
}
