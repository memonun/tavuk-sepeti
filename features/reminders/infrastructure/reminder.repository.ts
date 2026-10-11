/**
 * Persistence for reminders. Every read is bounded by construction (CLAUDE.md
 * §9): open-reminder views are capped with the true total returned alongside
 * so the page can say when it shows a partial list, the completed history is
 * paginated, and the calendar read takes an explicit range.
 */
import "server-only";

import { dueFromParts } from "@/features/reminders/domain/due";
import { ExternalApiError, NotFoundError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { isRepeatUnit } from "@/shared/utils/repeat-rule";

import type {
  Reminder,
  ReminderCounts,
  ReminderPriority,
} from "@/features/reminders/domain/reminder";
import type { StoredDue } from "@/features/reminders/domain/due";
import type { ReminderFields } from "@/features/reminders/domain/reminder.schema";

const REMINDER_SELECT =
  "id, list_id, title, notes, due_at, due_all_day, priority, flagged, repeat_unit, repeat_every, completed_at, recurrence_parent_id, created_at" as const;

/** Upper bound for one open-reminder view. Far above what a shop keeps open in
 *  one list; it exists so a runaway import can't turn a page load into an
 *  unbounded read. */
export const REMINDER_VIEW_LIMIT = 100;

/** Page size of the completed history (§9 default). */
export const COMPLETED_PAGE_SIZE = 25;

/** Upper bound for one calendar range (at most a 6-week month grid). */
export const REMINDER_RANGE_LIMIT = 500;

type ReminderRow = {
  id: string;
  list_id: string;
  title: string;
  notes: string | null;
  due_at: string | null;
  due_all_day: boolean;
  priority: number;
  flagged: boolean;
  repeat_unit: string | null;
  repeat_every: number | null;
  completed_at: string | null;
  recurrence_parent_id: string | null;
  created_at: string;
};

function toPriority(value: number): ReminderPriority {
  return value === 1 || value === 2 || value === 3 ? value : 0;
}

/** PostgREST returns timestamptz as "+00:00"; normalize to the "Z" form the
 *  domain produces so equal instants compare equal as strings. */
function toIso(value: string): string {
  return new Date(value).toISOString();
}

function rowToReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    list_id: row.list_id,
    title: row.title,
    notes: row.notes,
    due_at: row.due_at === null ? null : toIso(row.due_at),
    due_all_day: row.due_all_day,
    priority: toPriority(row.priority),
    flagged: row.flagged,
    repeat:
      isRepeatUnit(row.repeat_unit) && row.repeat_every !== null
        ? { unit: row.repeat_unit, every: row.repeat_every }
        : null,
    completed_at: row.completed_at === null ? null : toIso(row.completed_at),
    recurrence_parent_id: row.recurrence_parent_id,
    created_at: toIso(row.created_at),
  };
}

export interface ReminderPage {
  items: Reminder[];
  /** Rows matching the filter, including any beyond the returned slice. */
  total: number;
}

/** Which open reminders a view shows. */
export type OpenReminderFilter =
  | { readonly kind: "list"; readonly listId: string }
  /** Due before `dayEnd` (today's and overdue ones). */
  | { readonly kind: "dueBefore"; readonly dayEnd: string }
  | { readonly kind: "scheduled" }
  | { readonly kind: "all" }
  | { readonly kind: "flagged" };

export async function listOpenReminders(
  filter: OpenReminderFilter,
): Promise<Result<ReminderPage, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  let builder = supabase
    .from("reminders")
    .select(REMINDER_SELECT, { count: "exact" })
    .is("completed_at", null);

  switch (filter.kind) {
    case "list":
      builder = builder.eq("list_id", filter.listId);
      break;
    case "dueBefore":
      builder = builder.not("due_at", "is", null).lt("due_at", filter.dayEnd);
      break;
    case "scheduled":
      builder = builder.not("due_at", "is", null);
      break;
    case "flagged":
      builder = builder.eq("flagged", true);
      break;
    case "all":
      break;
  }

  const dated = filter.kind === "dueBefore" || filter.kind === "scheduled";
  const ordered = dated
    ? builder.order("due_at", { ascending: true }).order("created_at", { ascending: true })
    : builder.order("created_at", { ascending: true });

  const { data, error, count } = await ordered.range(0, REMINDER_VIEW_LIMIT - 1);
  if (error) {
    logger.error(
      { code: error.code, message: error.message, filter: filter.kind },
      "list_open_reminders_failed",
    );
    return err(new ExternalApiError({ message: "Anımsatıcılar yüklenemedi.", cause: error }));
  }
  return ok({ items: (data ?? []).map(rowToReminder), total: count ?? 0 });
}

/** The completed history, newest first. `page` is 1-based. */
export async function listCompletedReminders(
  page: number,
): Promise<Result<ReminderPage, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const from = (page - 1) * COMPLETED_PAGE_SIZE;
  const { data, error, count } = await supabase
    .from("reminders")
    .select(REMINDER_SELECT, { count: "exact" })
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .range(from, from + COMPLETED_PAGE_SIZE - 1);

  if (error) {
    logger.error({ code: error.code, message: error.message }, "list_completed_reminders_failed");
    return err(new ExternalApiError({ message: "Tamamlananlar yüklenemedi.", cause: error }));
  }
  return ok({ items: (data ?? []).map(rowToReminder), total: count ?? 0 });
}

/** Every dated reminder (open and completed) due within [from, to). */
export async function listRemindersDueBetween(
  from: string,
  to: string,
): Promise<Result<ReminderPage, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error, count } = await supabase
    .from("reminders")
    .select(REMINDER_SELECT, { count: "exact" })
    .gte("due_at", from)
    .lt("due_at", to)
    .order("due_at", { ascending: true })
    .order("created_at", { ascending: true })
    .range(0, REMINDER_RANGE_LIMIT - 1);

  if (error) {
    logger.error({ code: error.code, message: error.message }, "list_reminders_due_between_failed");
    return err(new ExternalApiError({ message: "Anımsatıcılar yüklenemedi.", cause: error }));
  }
  return ok({ items: (data ?? []).map(rowToReminder), total: count ?? 0 });
}

export async function findReminderById(
  id: string,
): Promise<Result<Reminder, ExternalApiError | NotFoundError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reminders")
    .select(REMINDER_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logger.error({ code: error.code, message: error.message }, "find_reminder_failed");
    return err(new ExternalApiError({ message: "Anımsatıcı yüklenemedi.", cause: error }));
  }
  if (!data) return err(new NotFoundError({ message: "Anımsatıcı bulunamadı." }));
  return ok(rowToReminder(data));
}

function fieldsToColumns(fields: ReminderFields) {
  return {
    list_id: fields.list_id,
    title: fields.title,
    notes: fields.notes,
    ...dueFromParts(fields.due),
    priority: fields.priority,
    flagged: fields.flagged,
    repeat_unit: fields.repeat?.unit ?? null,
    repeat_every: fields.repeat?.every ?? null,
  };
}

/** A missing list surfaces as a foreign-key violation (23503). */
const FK_VIOLATION = "23503";

export async function createReminder(
  fields: ReminderFields,
  createdBy: string,
): Promise<Result<string, ExternalApiError | NotFoundError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reminders")
    .insert({ ...fieldsToColumns(fields), created_by: createdBy })
    .select("id")
    .single();

  if (error) {
    if (error.code === FK_VIOLATION) return err(new NotFoundError({ message: "Liste bulunamadı." }));
    logger.error({ code: error.code, message: error.message }, "create_reminder_failed");
    return err(new ExternalApiError({ message: "Anımsatıcı eklenemedi.", cause: error }));
  }
  return ok(data.id);
}

export async function updateReminder(
  id: string,
  fields: ReminderFields,
): Promise<Result<void, ExternalApiError | NotFoundError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reminders")
    .update(fieldsToColumns(fields))
    .eq("id", id)
    .select("id");

  if (error) {
    if (error.code === FK_VIOLATION) return err(new NotFoundError({ message: "Liste bulunamadı." }));
    logger.error({ code: error.code, message: error.message }, "update_reminder_failed");
    return err(new ExternalApiError({ message: "Anımsatıcı güncellenemedi.", cause: error }));
  }
  if ((data ?? []).length === 0) return err(new NotFoundError({ message: "Anımsatıcı bulunamadı." }));
  return ok(undefined);
}

export async function setReminderCompletedAt(
  id: string,
  completedAt: Date | null,
): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("reminders")
    .update({ completed_at: completedAt === null ? null : completedAt.toISOString() })
    .eq("id", id);

  if (error) {
    logger.error({ code: error.code, message: error.message }, "set_reminder_completed_failed");
    return err(new ExternalApiError({ message: "Anımsatıcı durumu güncellenemedi.", cause: error }));
  }
  return ok(undefined);
}

/**
 * Inserts the next occurrence of a repeating reminder. Idempotent: ON CONFLICT
 * (recurrence_parent_id) DO NOTHING, so a retry or a re-completion after
 * un-ticking never creates a second "next" row for the same parent.
 * `inserted` is false when that next row already existed.
 */
export async function insertNextOccurrence(
  parent: Reminder,
  due: StoredDue,
  createdBy: string,
): Promise<Result<{ inserted: boolean }, ExternalApiError>> {
  if (parent.repeat === null) return ok({ inserted: false });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reminders")
    .upsert(
      {
        list_id: parent.list_id,
        title: parent.title,
        notes: parent.notes,
        due_at: due.due_at,
        due_all_day: due.due_all_day,
        priority: parent.priority,
        flagged: parent.flagged,
        repeat_unit: parent.repeat.unit,
        repeat_every: parent.repeat.every,
        recurrence_parent_id: parent.id,
        created_by: createdBy,
      },
      { onConflict: "recurrence_parent_id", ignoreDuplicates: true },
    )
    .select("id");

  if (error) {
    logger.error(
      { code: error.code, message: error.message, parent_id: parent.id },
      "insert_next_reminder_occurrence_failed",
    );
    return err(
      new ExternalApiError({ message: "Anımsatıcının sonraki tekrarı oluşturulamadı.", cause: error }),
    );
  }
  // DO NOTHING returns no row on conflict.
  return ok({ inserted: (data ?? []).length > 0 });
}

export async function deleteReminder(
  id: string,
): Promise<Result<void, ExternalApiError | NotFoundError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("reminders").delete().eq("id", id).select("id");
  if (error) {
    logger.error({ code: error.code, message: error.message }, "delete_reminder_failed");
    return err(new ExternalApiError({ message: "Anımsatıcı silinemedi.", cause: error }));
  }
  if ((data ?? []).length === 0) return err(new NotFoundError({ message: "Anımsatıcı bulunamadı." }));
  return ok(undefined);
}

/** Sidebar counts in one round trip (reminder_counts RPC). `dayEnd` is the
 *  Istanbul midnight that ends today. */
export async function getReminderCounts(
  dayEnd: string,
): Promise<Result<ReminderCounts, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reminder_counts", { p_day_end: dayEnd });
  if (error) {
    logger.error({ code: error.code, message: error.message }, "reminder_counts_failed");
    return err(new ExternalApiError({ message: "Anımsatıcı sayıları yüklenemedi.", cause: error }));
  }

  const byList: Record<string, number> = {};
  const smart = { today: 0, scheduled: 0, flagged: 0 };
  let all = 0;
  for (const row of data ?? []) {
    if (row.kind === "list") {
      byList[row.list_id] = row.n;
      all += row.n;
    } else if (row.kind === "today" || row.kind === "scheduled" || row.kind === "flagged") {
      smart[row.kind] = row.n;
    }
  }
  return ok({ ...smart, all, byList });
}

export interface DueNotificationSummary {
  /** Bell notifications created by this call. */
  readonly created: number;
  /** When the next reminder comes due, or null when none is waiting. */
  readonly nextDueAt: string | null;
}

/** Runs materialize_due_reminder_notifications() — see the migration. */
export async function materializeDueReminderNotifications(): Promise<
  Result<DueNotificationSummary, ExternalApiError>
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("materialize_due_reminder_notifications");
  if (error) {
    logger.error({ code: error.code, message: error.message }, "materialize_due_reminders_failed");
    return err(new ExternalApiError({ message: "Anımsatıcı bildirimleri oluşturulamadı.", cause: error }));
  }
  // The generated type says `string`, but the column is null when nothing is waiting.
  const row = (data ?? [])[0] as { created: number; next_due_at: string | null } | undefined;
  return ok({
    created: row?.created ?? 0,
    nextDueAt: row?.next_due_at ? toIso(row.next_due_at) : null,
  });
}
