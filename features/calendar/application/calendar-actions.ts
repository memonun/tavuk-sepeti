"use server";

/**
 * Calendar (the colored containers) Server Actions. Pattern: assertAdmin →
 * Zod parse → repo → logAudit → revalidatePath → ok().
 */
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import {
  createCalendarSchema,
  deleteCalendarSchema,
  updateCalendarSchema,
} from "@/features/calendar/domain/calendar.schema";
import {
  createCalendar,
  deleteCalendar,
  updateCalendar,
} from "@/features/calendar/infrastructure/calendar.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

const TAKVIM_PATH = "/takvim";

export async function createCalendarAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = createCalendarSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz takvim.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const created = await createCalendar({ ...parsed.data, created_by: auth.value.id });
  if (!created.ok) return err(created.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "calendar.created",
    entity_type: "calendar",
    entity_id: created.value,
    after: { color: parsed.data.color },
  });

  revalidatePath(TAKVIM_PATH);
  return ok({ id: created.value });
}

export async function updateCalendarAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = updateCalendarSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz takvim.",
        details: parsed.error.flatten(),
      }),
    );
  }
  const { id, ...patch } = parsed.data;

  const updated = await updateCalendar(id, patch);
  if (!updated.ok) return err(updated.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "calendar.updated",
    entity_type: "calendar",
    entity_id: id,
    ...(patch.color !== undefined ? { after: { color: patch.color } } : {}),
  });

  revalidatePath(TAKVIM_PATH);
  return ok({ id });
}

/** Deletes the calendar together with every event in it (the UI confirms). */
export async function deleteCalendarAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = deleteCalendarSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz takvim." }));
  }

  const deleted = await deleteCalendar(parsed.data.id);
  if (!deleted.ok) return err(deleted.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "calendar.deleted",
    entity_type: "calendar",
    entity_id: parsed.data.id,
  });

  revalidatePath(TAKVIM_PATH);
  return ok({ id: parsed.data.id });
}
