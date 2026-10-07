/**
 * Ajanda — the owner's own work tracker: dated chores on a weekly calendar,
 * undated to-dos, and recurring farm routines (aşı, parazit ilacı, kümes
 * temizliği). Persisted in `agenda_tasks`
 * (supabase/migrations/20261007120000_agenda_tasks.sql).
 *
 * A recurring task is an ordinary task that carries its repeat rule;
 * completing it spawns the next occurrence (features/agenda/domain/recurrence.ts).
 * There is no separate template table — each occurrence is a full, editable
 * row, and changing or clearing the rule on the open occurrence changes the
 * series from there on.
 */

export type AgendaCategory =
  | "genel"
  | "hayvan_sagligi"
  | "kumes_bakimi"
  | "satis_teslimat"
  | "alisveris";

export type RepeatUnit = "day" | "week" | "month";

export interface RepeatRule {
  readonly unit: RepeatUnit;
  /** 1 = every unit; 3 + "month" = every three months. */
  readonly every: number;
}

export interface AgendaTask {
  readonly id: string;
  readonly title: string;
  readonly notes: string | null;
  readonly category: AgendaCategory;
  /** YYYY-MM-DD Istanbul calendar day; null = undated to-do. */
  readonly due_date: string | null;
  /** Non-null iff the task repeats (DB enforces the pair). */
  readonly repeat: RepeatRule | null;
  /** Null while open. */
  readonly completed_at: Date | null;
  /** The occurrence this row was generated from, if any. */
  readonly recurrence_parent_id: string | null;
  readonly created_by: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/** Display order is the order of this record. Must match the DB CHECK
 *  constraint agenda_tasks_category_check. */
export const AGENDA_CATEGORY_LABELS: Readonly<Record<AgendaCategory, string>> = {
  genel: "Genel",
  hayvan_sagligi: "Hayvan Sağlığı",
  kumes_bakimi: "Kümes Bakımı",
  satis_teslimat: "Satış / Teslimat",
  alisveris: "Alışveriş",
};

export const AGENDA_CATEGORIES = Object.keys(AGENDA_CATEGORY_LABELS) as AgendaCategory[];

/** Turkish locative suffix for "every N <unit>" ("3 günde bir", "2 haftada
 *  bir", "3 ayda bir"). The unit words are fixed, so the suffix is too. */
const REPEAT_UNIT_EVERY_N: Readonly<Record<RepeatUnit, string>> = {
  day: "günde",
  week: "haftada",
  month: "ayda",
};

const REPEAT_UNIT_EVERY_ONE: Readonly<Record<RepeatUnit, string>> = {
  day: "Her gün",
  week: "Her hafta",
  month: "Her ay",
};

/** "Her hafta", "3 ayda bir", ... — the label shown next to a recurring task. */
export function describeRepeatRule(rule: RepeatRule): string {
  if (rule.every === 1) return REPEAT_UNIT_EVERY_ONE[rule.unit];
  return `${rule.every} ${REPEAT_UNIT_EVERY_N[rule.unit]} bir`;
}

export function isCompleted(task: Pick<AgendaTask, "completed_at">): boolean {
  return task.completed_at !== null;
}
