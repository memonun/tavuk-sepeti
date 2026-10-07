"use server";

/**
 * Agenda task Server Actions. Pattern: assertAdmin → Zod parse → repo →
 * logAudit → revalidatePath → ok() (features/finance/application/expense-actions.ts).
 */
import { revalidatePath } from "next/cache";

import {
  createAgendaTaskSchema,
  deleteAgendaTaskSchema,
  setAgendaTaskCompletedSchema,
  updateAgendaTaskSchema,
} from "@/features/agenda/domain/agenda-task.schema";
import { nextOccurrence } from "@/features/agenda/domain/recurrence";
import {
  createAgendaTask,
  deleteAgendaTask,
  findAgendaTaskById,
  insertNextOccurrence,
  setAgendaTaskCompletedAt,
  updateAgendaTask,
} from "@/features/agenda/infrastructure/agenda-task.repository";
import { assertAdmin } from "@/features/auth/application/assert-admin";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";
import { todayInIstanbul } from "@/shared/utils/date";

const AJANDA_PATH = "/ajanda";

export async function createAgendaTaskAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = createAgendaTaskSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz iş.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const created = await createAgendaTask({ ...parsed.data, created_by: auth.value.id });
  if (!created.ok) return err(created.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "agenda_task.created",
    entity_type: "agenda_task",
    entity_id: created.value,
    after: { category: parsed.data.category, due_date: parsed.data.due_date },
  });

  revalidatePath(AJANDA_PATH);
  return ok({ id: created.value });
}

export async function updateAgendaTaskAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = updateAgendaTaskSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz iş.",
        details: parsed.error.flatten(),
      }),
    );
  }
  const { id, ...rest } = parsed.data;

  const updated = await updateAgendaTask(id, rest);
  if (!updated.ok) return err(updated.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "agenda_task.updated",
    entity_type: "agenda_task",
    entity_id: id,
    after: { category: rest.category, due_date: rest.due_date },
  });

  revalidatePath(AJANDA_PATH);
  return ok({ id });
}

/**
 * Ticks a task off (or back on). Completing a recurring task first creates
 * its next occurrence, THEN marks this one done — in that order on purpose:
 *   - if the insert fails, nothing changed and the owner can simply retry;
 *   - if the insert succeeds but marking done fails, a retry re-runs the
 *     insert as a no-op (ON CONFLICT on recurrence_parent_id) and finishes.
 * The reverse order could leave a completed recurring task with no next
 * occurrence — the series would silently end.
 */
export async function setAgendaTaskCompletedAction(
  raw: unknown,
): Promise<Result<{ id: string; next_due_date: string | null }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = setAgendaTaskCompletedSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz istek." }));
  }
  const { id, completed } = parsed.data;

  const existing = await findAgendaTaskById(id);
  if (!existing.ok) return err(existing.error);
  const task = existing.value;

  // Already in the requested state — nothing to do (double tap, stale tab).
  if ((task.completed_at !== null) === completed) {
    return ok({ id, next_due_date: null });
  }

  // Only reported back when a new row was actually created — re-completing
  // a reopened task finds its next occurrence already there.
  let nextDueDate: string | null = null;
  if (completed && task.repeat !== null && task.due_date !== null) {
    const candidate = nextOccurrence(task.due_date, task.repeat, todayInIstanbul());
    const spawned = await insertNextOccurrence(task, candidate, auth.value.id);
    if (!spawned.ok) return err(spawned.error);
    if (spawned.value.inserted) nextDueDate = candidate;
  }

  const marked = await setAgendaTaskCompletedAt(id, completed ? new Date() : null);
  if (!marked.ok) return err(marked.error);

  await logAudit({
    actor_id: auth.value.id,
    action: completed ? "agenda_task.completed" : "agenda_task.reopened",
    entity_type: "agenda_task",
    entity_id: id,
    ...(nextDueDate !== null ? { metadata: { next_due_date: nextDueDate } } : {}),
  });

  revalidatePath(AJANDA_PATH);
  return ok({ id, next_due_date: nextDueDate });
}

export async function deleteAgendaTaskAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = deleteAgendaTaskSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz iş." }));
  }

  const deleted = await deleteAgendaTask(parsed.data.id);
  if (!deleted.ok) return err(deleted.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "agenda_task.deleted",
    entity_type: "agenda_task",
    entity_id: parsed.data.id,
  });

  revalidatePath(AJANDA_PATH);
  return ok({ id: parsed.data.id });
}
