/**
 * Anımsatıcılar — the admins' shared reminders, modeled on Apple Reminders:
 * colored lists, reminders with an optional day (and optional time), priority,
 * a flag and a repeat rule. Persisted in `reminder_lists` / `reminders`
 * (supabase/migrations/20261010221830_takvim_ve_animsaticilar.sql).
 *
 * A repeating reminder is an ordinary reminder that carries its rule;
 * completing it spawns the next occurrence as a new row
 * (features/reminders/domain/recurrence.ts). There is no template table.
 *
 * Instants are ISO strings, not Date objects: every one of these crosses the
 * Server → Client Component boundary and the MCP connector's JSON as-is.
 */
import type { AccentColor } from "@/shared/palette/accent-colors";
import type { RepeatRule } from "@/shared/utils/repeat-rule";

export interface ReminderList {
  readonly id: string;
  readonly name: string;
  readonly color: AccentColor;
  readonly sort_order: number;
}

/** 0 none, 1 low, 2 medium, 3 high — Apple's !, !!, !!!. */
export const REMINDER_PRIORITIES = [0, 1, 2, 3] as const;
export type ReminderPriority = (typeof REMINDER_PRIORITIES)[number];

export const REMINDER_PRIORITY_LABELS: Readonly<Record<ReminderPriority, string>> = {
  0: "Yok",
  1: "Düşük",
  2: "Orta",
  3: "Yüksek",
};

/** The "!", "!!", "!!!" shown before a reminder's title. */
export function priorityMarks(priority: ReminderPriority): string {
  return "!".repeat(priority);
}

export interface Reminder {
  readonly id: string;
  readonly list_id: string;
  readonly title: string;
  readonly notes: string | null;
  /** Null = no date. All-day: the Istanbul midnight of the day. */
  readonly due_at: string | null;
  /** Meaningful only with a due_at: true = "that day", false = that time. */
  readonly due_all_day: boolean;
  readonly priority: ReminderPriority;
  readonly flagged: boolean;
  /** Non-null iff the reminder repeats (the DB enforces the pair). */
  readonly repeat: RepeatRule | null;
  /** Null while open. */
  readonly completed_at: string | null;
  /** The occurrence this row was generated from, if any. */
  readonly recurrence_parent_id: string | null;
  readonly created_at: string;
}

/** The built-in lists at the top of the sidebar. */
export const SMART_LIST_IDS = ["bugun", "planlanan", "tumu", "bayrakli", "tamamlanan"] as const;
export type SmartListId = (typeof SMART_LIST_IDS)[number];

export const SMART_LIST_LABELS: Readonly<Record<SmartListId, string>> = {
  bugun: "Bugün",
  planlanan: "Planlanan",
  tumu: "Tümü",
  bayrakli: "Bayraklı",
  tamamlanan: "Tamamlanan",
};

export function isSmartListId(value: unknown): value is SmartListId {
  return typeof value === "string" && (SMART_LIST_IDS as readonly string[]).includes(value);
}

/** What the page is showing: a built-in smart list or one of the user's lists. */
export type ReminderView =
  | { readonly kind: "smart"; readonly id: SmartListId }
  | { readonly kind: "list"; readonly id: string };

export interface ReminderCounts {
  readonly today: number;
  readonly scheduled: number;
  readonly all: number;
  readonly flagged: number;
  /** Open reminders per list id; a list with none is simply absent. */
  readonly byList: Readonly<Record<string, number>>;
}

export function isCompleted(reminder: Pick<Reminder, "completed_at">): boolean {
  return reminder.completed_at !== null;
}
