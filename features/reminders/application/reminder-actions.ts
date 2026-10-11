"use server";

/**
 * Reminder Server Actions. Pattern: assertAdmin → Zod parse → repo →
 * logAudit → revalidatePath → ok() (features/finance/application/expense-actions.ts).
 */
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { nextReminderDue } from "@/features/reminders/domain/recurrence";
import {
  applyReminderPatch,
  blankReminderFields,
  createReminderSchema,
  deleteReminderSchema,
  fieldsOfReminder,
  setReminderCompletedSchema,
  updateReminderSchema,
} from "@/features/reminders/domain/reminder.schema";
import {
  createReminder,
  deleteReminder,
  findReminderById,
  insertNextOccurrence,
  setReminderCompletedAt,
  updateReminder,
} from "@/features/reminders/infrastructure/reminder.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

/** Reminders show on both pages: their own, and the calendar's day cells. */
function revalidateReminderPages(): void {
  revalidatePath("/animsaticilar");
  revalidatePath("/takvim");
}

export async function createReminderAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = createReminderSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz anımsatıcı.",
        details: parsed.error.flatten(),
      }),
    );
  }
  const { list_id, title, ...patch } = parsed.data;
  const fields = applyReminderPatch(blankReminderFields(list_id, title), patch);
  if (!fields.ok) return err(new ValidationError({ message: fields.error }));

  const created = await createReminder(fields.value, auth.value.id);
  if (!created.ok) return err(created.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "reminder.created",
    entity_type: "reminder",
    entity_id: created.value,
    after: { list_id, due_date: fields.value.due.date },
  });

  revalidateReminderPages();
  return ok({ id: created.value });
}

/** A patch: only the keys present in `raw` change (see reminder.schema.ts). */
export async function updateReminderAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = updateReminderSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz anımsatıcı.",
        details: parsed.error.flatten(),
      }),
    );
  }
  const { id, ...patch } = parsed.data;

  const existing = await findReminderById(id);
  if (!existing.ok) return err(existing.error);

  const fields = applyReminderPatch(fieldsOfReminder(existing.value), patch);
  if (!fields.ok) return err(new ValidationError({ message: fields.error }));

  const updated = await updateReminder(id, fields.value);
  if (!updated.ok) return err(updated.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "reminder.updated",
    entity_type: "reminder",
    entity_id: id,
    after: { list_id: fields.value.list_id, due_date: fields.value.due.date },
  });

  revalidateReminderPages();
  return ok({ id });
}

/**
 * Ticks a reminder off (or back on). Completing a repeating reminder first
 * creates its next occurrence, THEN marks this one done — in that order on
 * purpose:
 *   - if the insert fails, nothing changed and the admin can simply retry;
 *   - if the insert succeeds but marking done fails, a retry re-runs the
 *     insert as a no-op (ON CONFLICT on recurrence_parent_id) and finishes.
 * The reverse order could leave a completed repeating reminder with no next
 * occurrence — the series would silently end.
 */
export async function setReminderCompletedAction(
  raw: unknown,
): Promise<Result<{ id: string; next_due_at: string | null }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = setReminderCompletedSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz istek." }));
  }
  const { id, completed } = parsed.data;

  const existing = await findReminderById(id);
  if (!existing.ok) return err(existing.error);
  const reminder = existing.value;

  // Already in the requested state — nothing to do (double tap, stale tab).
  if ((reminder.completed_at !== null) === completed) {
    return ok({ id, next_due_at: null });
  }

  const now = new Date();

  // Only reported back when a new row was actually created — re-completing a
  // reopened reminder finds its next occurrence already there.
  let nextDueAt: string | null = null;
  if (completed && reminder.repeat !== null && reminder.due_at !== null) {
    const next = nextReminderDue(
      { due_at: reminder.due_at, due_all_day: reminder.due_all_day },
      reminder.repeat,
      now,
    );
    const spawned = await insertNextOccurrence(reminder, next, auth.value.id);
    if (!spawned.ok) return err(spawned.error);
    if (spawned.value.inserted) nextDueAt = next.due_at;
  }

  const marked = await setReminderCompletedAt(id, completed ? now : null);
  if (!marked.ok) return err(marked.error);

  await logAudit({
    actor_id: auth.value.id,
    action: completed ? "reminder.completed" : "reminder.reopened",
    entity_type: "reminder",
    entity_id: id,
    ...(nextDueAt !== null ? { metadata: { next_due_at: nextDueAt } } : {}),
  });

  revalidateReminderPages();
  return ok({ id, next_due_at: nextDueAt });
}

export async function deleteReminderAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = deleteReminderSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz anımsatıcı." }));
  }

  const deleted = await deleteReminder(parsed.data.id);
  if (!deleted.ok) return err(deleted.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "reminder.deleted",
    entity_type: "reminder",
    entity_id: parsed.data.id,
  });

  revalidateReminderPages();
  return ok({ id: parsed.data.id });
}
