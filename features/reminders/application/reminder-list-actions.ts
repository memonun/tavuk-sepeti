"use server";

/**
 * Reminder-list Server Actions — same pattern as reminder-actions.ts.
 */
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import {
  createReminderListSchema,
  deleteReminderListSchema,
  updateReminderListSchema,
} from "@/features/reminders/domain/reminder.schema";
import {
  createReminderList,
  deleteReminderList,
  updateReminderList,
} from "@/features/reminders/infrastructure/reminder-list.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

/** A list's name and color show on the calendar's reminder chips too. */
function revalidateReminderPages(): void {
  revalidatePath("/animsaticilar");
  revalidatePath("/takvim");
}

export async function createReminderListAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = createReminderListSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz liste.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const created = await createReminderList({ ...parsed.data, created_by: auth.value.id });
  if (!created.ok) return err(created.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "reminder_list.created",
    entity_type: "reminder_list",
    entity_id: created.value,
    after: { color: parsed.data.color },
  });

  revalidateReminderPages();
  return ok({ id: created.value });
}

export async function updateReminderListAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = updateReminderListSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz liste.",
        details: parsed.error.flatten(),
      }),
    );
  }
  const { id, ...patch } = parsed.data;

  const updated = await updateReminderList(id, patch);
  if (!updated.ok) return err(updated.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "reminder_list.updated",
    entity_type: "reminder_list",
    entity_id: id,
    ...(patch.color !== undefined ? { after: { color: patch.color } } : {}),
  });

  revalidateReminderPages();
  return ok({ id });
}

/** Deletes the list together with every reminder in it (the UI confirms). */
export async function deleteReminderListAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = deleteReminderListSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz liste." }));
  }

  const deleted = await deleteReminderList(parsed.data.id);
  if (!deleted.ok) return err(deleted.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "reminder_list.deleted",
    entity_type: "reminder_list",
    entity_id: parsed.data.id,
  });

  revalidateReminderPages();
  return ok({ id: parsed.data.id });
}
