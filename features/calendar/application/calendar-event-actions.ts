"use server";

/**
 * Calendar event Server Actions. Pattern: assertAdmin → Zod parse → repo →
 * logAudit → revalidatePath → ok().
 */
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import {
  createEventSchema,
  deleteEventOccurrenceSchema,
  deleteEventSchema,
  resolveEventColumns,
  updateEventSchema,
} from "@/features/calendar/domain/calendar.schema";
import {
  createEvent,
  deleteEvent,
  findEventById,
  insertEventException,
  updateEvent,
} from "@/features/calendar/infrastructure/calendar-event.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

const TAKVIM_PATH = "/takvim";

export async function createEventAction(raw: unknown): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = createEventSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz etkinlik.",
        details: parsed.error.flatten(),
      }),
    );
  }
  const columns = resolveEventColumns(parsed.data);
  if (!columns.ok) return err(new ValidationError({ message: columns.error }));

  const created = await createEvent(columns.value, auth.value.id);
  if (!created.ok) return err(created.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "calendar_event.created",
    entity_type: "calendar_event",
    entity_id: created.value,
    after: { calendar_id: columns.value.calendar_id, starts_at: columns.value.starts_at },
  });

  revalidatePath(TAKVIM_PATH);
  return ok({ id: created.value });
}

/** A full rewrite of the event — for a repeating one, of the whole series. */
export async function updateEventAction(raw: unknown): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = updateEventSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz etkinlik.",
        details: parsed.error.flatten(),
      }),
    );
  }
  const { id, ...values } = parsed.data;
  const columns = resolveEventColumns(values);
  if (!columns.ok) return err(new ValidationError({ message: columns.error }));

  const updated = await updateEvent(id, columns.value);
  if (!updated.ok) return err(updated.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "calendar_event.updated",
    entity_type: "calendar_event",
    entity_id: id,
    after: { calendar_id: columns.value.calendar_id, starts_at: columns.value.starts_at },
  });

  revalidatePath(TAKVIM_PATH);
  return ok({ id });
}

/** Deletes the event — for a repeating one, every occurrence. */
export async function deleteEventAction(raw: unknown): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = deleteEventSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz etkinlik." }));
  }

  const deleted = await deleteEvent(parsed.data.id);
  if (!deleted.ok) return err(deleted.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "calendar_event.deleted",
    entity_type: "calendar_event",
    entity_id: parsed.data.id,
  });

  revalidatePath(TAKVIM_PATH);
  return ok({ id: parsed.data.id });
}

/** Removes ONE occurrence of a repeating event; the rest of the series stays. */
export async function deleteEventOccurrenceAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = deleteEventOccurrenceSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz etkinlik." }));
  }
  const { id, occurrence_date } = parsed.data;

  const existing = await findEventById(id);
  if (!existing.ok) return err(existing.error);
  if (existing.value.repeat === null) {
    return err(new ValidationError({ message: "Bu etkinlik tekrarlamıyor; tamamını silin." }));
  }

  const skipped = await insertEventException(id, occurrence_date);
  if (!skipped.ok) return err(skipped.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "calendar_event.occurrence_deleted",
    entity_type: "calendar_event",
    entity_id: id,
    metadata: { occurrence_date },
  });

  revalidatePath(TAKVIM_PATH);
  return ok({ id });
}
