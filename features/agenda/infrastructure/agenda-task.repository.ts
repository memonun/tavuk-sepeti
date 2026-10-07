/**
 * Persistence for agenda_tasks. Reads are bounded by construction: the
 * calendar reads one week, the backlog reads open overdue/undated rows —
 * both capped (CLAUDE.md §9) with the true total returned alongside so the
 * page can say when it's showing a partial list.
 */
import "server-only";

import { ExternalApiError, NotFoundError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { AgendaCategory, AgendaTask, RepeatUnit } from "@/features/agenda/domain/agenda-task";

const AGENDA_TASK_SELECT =
  "id, title, notes, category, due_date, repeat_unit, repeat_every, completed_at, recurrence_parent_id, created_by, created_at, updated_at" as const;

/** Upper bound for one week's calendar and for the backlog panel. Far above
 *  what one farm schedules in a week; the cap only exists so a runaway import
 *  can't turn one page load into an unbounded read. */
export const AGENDA_LIST_LIMIT = 100;

type AgendaTaskRow = {
  id: string;
  title: string;
  notes: string | null;
  category: AgendaCategory;
  due_date: string | null;
  repeat_unit: RepeatUnit | null;
  repeat_every: number | null;
  completed_at: string | null;
  recurrence_parent_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function rowToAgendaTask(row: AgendaTaskRow): AgendaTask {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    category: row.category,
    due_date: row.due_date,
    repeat:
      row.repeat_unit !== null && row.repeat_every !== null
        ? { unit: row.repeat_unit, every: row.repeat_every }
        : null,
    completed_at: row.completed_at === null ? null : new Date(row.completed_at),
    recurrence_parent_id: row.recurrence_parent_id,
    created_by: row.created_by,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

export interface AgendaTaskList {
  items: AgendaTask[];
  /** Rows matching the filter, including any beyond AGENDA_LIST_LIMIT. */
  total: number;
}

/** Every task (open and completed) dated within [from, to]. */
export async function listAgendaTasksInRange(
  from: string,
  to: string,
  category: AgendaCategory | undefined,
): Promise<Result<AgendaTaskList, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let builder = (supabase as any)
    .from("agenda_tasks")
    .select(AGENDA_TASK_SELECT, { count: "exact" })
    .gte("due_date", from)
    .lte("due_date", to);
  if (category) builder = builder.eq("category", category);

  const { data, error, count } = await builder
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: true })
    .range(0, AGENDA_LIST_LIMIT - 1);

  if (error) {
    logger.error({ code: error.code, message: error.message }, "list_agenda_tasks_in_range_failed");
    return err(new ExternalApiError({ message: "Ajanda yüklenemedi.", cause: error }));
  }
  return ok({
    items: ((data ?? []) as AgendaTaskRow[]).map(rowToAgendaTask),
    total: count ?? 0,
  });
}

/** Open tasks that are undated or dated before `today` — one round trip for
 *  both backlog panels (features/agenda/domain/agenda-week.ts splitBacklog). */
export async function listAgendaBacklog(
  today: string,
  category: AgendaCategory | undefined,
): Promise<Result<AgendaTaskList, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let builder = (supabase as any)
    .from("agenda_tasks")
    .select(AGENDA_TASK_SELECT, { count: "exact" })
    .is("completed_at", null)
    .or(`due_date.is.null,due_date.lt.${today}`);
  if (category) builder = builder.eq("category", category);

  const { data, error, count } = await builder
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .range(0, AGENDA_LIST_LIMIT - 1);

  if (error) {
    logger.error({ code: error.code, message: error.message }, "list_agenda_backlog_failed");
    return err(new ExternalApiError({ message: "Bekleyen işler yüklenemedi.", cause: error }));
  }
  return ok({
    items: ((data ?? []) as AgendaTaskRow[]).map(rowToAgendaTask),
    total: count ?? 0,
  });
}

export async function findAgendaTaskById(
  id: string,
): Promise<Result<AgendaTask, ExternalApiError | NotFoundError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("agenda_tasks")
    .select(AGENDA_TASK_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logger.error({ code: error.code, message: error.message }, "find_agenda_task_failed");
    return err(new ExternalApiError({ message: "İş yüklenemedi.", cause: error }));
  }
  if (!data) return err(new NotFoundError({ message: "İş bulunamadı." }));
  return ok(rowToAgendaTask(data as AgendaTaskRow));
}

export interface AgendaTaskWriteInput {
  title: string;
  notes: string | null;
  category: AgendaCategory;
  due_date: string | null;
  repeat_unit: RepeatUnit | null;
  repeat_every: number | null;
}

export async function createAgendaTask(
  input: AgendaTaskWriteInput & { created_by: string },
): Promise<Result<string, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("agenda_tasks")
    .insert({
      title: input.title,
      notes: input.notes,
      category: input.category,
      due_date: input.due_date,
      repeat_unit: input.repeat_unit,
      repeat_every: input.repeat_every,
      created_by: input.created_by,
    })
    .select("id")
    .single();

  if (error) {
    logger.error({ code: error.code, message: error.message }, "create_agenda_task_failed");
    return err(new ExternalApiError({ message: "İş eklenemedi.", cause: error }));
  }
  return ok((data as { id: string }).id);
}

export async function updateAgendaTask(
  id: string,
  input: AgendaTaskWriteInput,
): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("agenda_tasks")
    .update({
      title: input.title,
      notes: input.notes,
      category: input.category,
      due_date: input.due_date,
      repeat_unit: input.repeat_unit,
      repeat_every: input.repeat_every,
    })
    .eq("id", id);

  if (error) {
    logger.error({ code: error.code, message: error.message }, "update_agenda_task_failed");
    return err(new ExternalApiError({ message: "İş güncellenemedi.", cause: error }));
  }
  return ok(undefined);
}

export async function setAgendaTaskCompletedAt(
  id: string,
  completedAt: Date | null,
): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("agenda_tasks")
    .update({ completed_at: completedAt === null ? null : completedAt.toISOString() })
    .eq("id", id);

  if (error) {
    logger.error({ code: error.code, message: error.message }, "set_agenda_task_completed_failed");
    return err(new ExternalApiError({ message: "İş durumu güncellenemedi.", cause: error }));
  }
  return ok(undefined);
}

/**
 * Inserts the next occurrence of a recurring task. Idempotent: ON CONFLICT
 * (recurrence_parent_id) DO NOTHING, so a retry or a re-completion after
 * un-ticking never creates a second "next" row for the same parent.
 * `inserted` is false when that next row already existed.
 */
export async function insertNextOccurrence(
  parent: AgendaTask,
  dueDate: string,
  createdBy: string,
): Promise<Result<{ inserted: boolean }, ExternalApiError>> {
  if (parent.repeat === null) return ok({ inserted: false });
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("agenda_tasks")
    .upsert(
      {
        title: parent.title,
        notes: parent.notes,
        category: parent.category,
        due_date: dueDate,
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
      "insert_next_agenda_occurrence_failed",
    );
    return err(new ExternalApiError({ message: "Tekrarlayan işin sonraki tarihi oluşturulamadı.", cause: error }));
  }
  // DO NOTHING returns no row on conflict.
  return ok({ inserted: ((data ?? []) as unknown[]).length > 0 });
}

export async function deleteAgendaTask(id: string): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("agenda_tasks").delete().eq("id", id);
  if (error) {
    logger.error({ code: error.code, message: error.message }, "delete_agenda_task_failed");
    return err(new ExternalApiError({ message: "İş silinemedi.", cause: error }));
  }
  return ok(undefined);
}
