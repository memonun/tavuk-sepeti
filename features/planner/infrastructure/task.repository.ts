import "server-only";

/**
 * Persistence layer for planner_tasks.
 *
 * RLS owner-scoped — every read/write runs as the logged-in admin via the
 * cookie-bound SSR client. The Server Action layer is still responsible
 * for assertAdmin() before any call lands here (see customer_views'
 * view.repository.ts, same posture).
 */
import {
  ExternalApiError,
  NotFoundError,
} from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import { rowToPlannerTask, type PlannerTaskRow } from "@/features/planner/infrastructure/task.mapper";

import type { PlannerTask, PlannerTaskStatus } from "@/features/planner/domain/task";

const TABLE = "planner_tasks";
const SELECT = "id, owner_id, title, notes, scheduled_date, status, created_at, updated_at";

/**
 * `planner_tasks` post-dates the generated `Database` type, so the table
 * is not in it yet. This is the repo's documented cast for a
 * not-yet-generated schema object (see storefront-settings.repository.ts);
 * it disappears on the next `pnpm db:types`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type LooseClient = { from: (table: string) => any };
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Bounded per CLAUDE.md §9 — a personal planner's backlog is expected to
 *  stay tiny, but nothing here assumes that without a ceiling. */
const LIST_CAP = 100;

export async function listTasksInRange(
  fromIso: string,
  toIso: string,
): Promise<Result<PlannerTask[], ExternalApiError>> {
  const supabase = (await createSupabaseServerClient()) as unknown as LooseClient;
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT)
    .gte("scheduled_date", fromIso)
    .lte("scheduled_date", toIso)
    .order("scheduled_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(LIST_CAP);
  if (error) {
    logger.error({ code: error.code, message: error.message }, "list_planner_tasks_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(((data ?? []) as PlannerTaskRow[]).map(rowToPlannerTask));
}

export async function listUnscheduledTasks(): Promise<
  Result<PlannerTask[], ExternalApiError>
> {
  const supabase = (await createSupabaseServerClient()) as unknown as LooseClient;
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT)
    .is("scheduled_date", null)
    .order("created_at", { ascending: false })
    .limit(LIST_CAP);
  if (error) {
    logger.error(
      { code: error.code, message: error.message },
      "list_unscheduled_planner_tasks_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(((data ?? []) as PlannerTaskRow[]).map(rowToPlannerTask));
}

export interface CreateTaskParams {
  readonly ownerId: string;
  readonly title: string;
  readonly notes: string | null;
  readonly scheduledDate: string | null;
}

export async function createTask(
  params: CreateTaskParams,
): Promise<Result<PlannerTask, ExternalApiError>> {
  const supabase = (await createSupabaseServerClient()) as unknown as LooseClient;
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      owner_id: params.ownerId,
      title: params.title,
      notes: params.notes,
      scheduled_date: params.scheduledDate,
    })
    .select(SELECT)
    .single();
  if (error || !data) {
    logger.error({ code: error?.code }, "create_planner_task_failed");
    return err(
      new ExternalApiError({
        message: error?.message ?? "Görev oluşturulamadı.",
        cause: error,
      }),
    );
  }
  return ok(rowToPlannerTask(data as PlannerTaskRow));
}

export interface UpdateTaskParams {
  readonly id: string;
  readonly title?: string;
  readonly notes?: string | null;
  readonly scheduledDate?: string | null;
  readonly status?: PlannerTaskStatus;
}

export async function updateTask(
  params: UpdateTaskParams,
): Promise<Result<PlannerTask, ExternalApiError | NotFoundError>> {
  const supabase = (await createSupabaseServerClient()) as unknown as LooseClient;

  const patch: Record<string, unknown> = {};
  if (params.title !== undefined) patch.title = params.title;
  if (params.notes !== undefined) patch.notes = params.notes;
  if (params.scheduledDate !== undefined) patch.scheduled_date = params.scheduledDate;
  if (params.status !== undefined) patch.status = params.status;

  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("id", params.id)
    .select(SELECT)
    .maybeSingle();
  if (error) {
    logger.error({ id: params.id, code: error.code }, "update_planner_task_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  if (!data) {
    // RLS-denied or genuinely missing — both surface as no-row. warn (not
    // error) since probing someone else's id is expected-shape behavior,
    // not a system fault.
    logger.warn({ id: params.id }, "update_planner_task_not_found");
    return err(new NotFoundError({ message: "Görev bulunamadı." }));
  }
  return ok(rowToPlannerTask(data as PlannerTaskRow));
}

export async function deleteTask(
  id: string,
): Promise<Result<{ deleted: boolean }, ExternalApiError>> {
  const supabase = (await createSupabaseServerClient()) as unknown as LooseClient;
  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    logger.error({ id, code: error.code }, "delete_planner_task_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok({ deleted: data != null });
}
