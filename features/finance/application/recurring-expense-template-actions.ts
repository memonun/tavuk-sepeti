"use server";

/**
 * Recurring expense template Server Actions. Pattern: assertAdmin -> Zod
 * parse -> repo -> logAudit -> revalidatePath -> ok()
 * (features/finance/application/expense-actions.ts).
 */
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import {
  createRecurringExpenseTemplateSchema,
  deleteRecurringExpenseTemplateSchema,
  setRecurringExpenseTemplateActiveSchema,
  updateRecurringExpenseTemplateSchema,
} from "@/features/finance/domain/recurring-expense-template.schema";
import { toRecurrenceCadence } from "@/features/finance/domain/recurring-expense-template";
import {
  createTemplate,
  deleteTemplate,
  findTemplateById,
  setTemplateActive,
  updateTemplate,
  type TemplateWriteInput,
} from "@/features/finance/infrastructure/recurring-expense-template.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";
import { todayInIstanbul } from "@/shared/utils/date";
import { firstRunOnOrAfter } from "@/shared/utils/recurrence";

const RUTIN_GIDERLER_PATH = "/finans/rutin-giderler";
const FINANS_PATH = "/finans";

function computeNextRunAt(input: {
  cadence: TemplateWriteInput["cadence"];
  day_of_week: number | null;
  day_of_month: number | null;
  start_date: string;
}): Date {
  const { kind, shape } = toRecurrenceCadence(input.cadence, input.day_of_week, input.day_of_month);
  return firstRunOnOrAfter(input.start_date, kind, shape);
}

export async function createRecurringExpenseTemplateAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = createRecurringExpenseTemplateSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz rutin gider.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const created = await createTemplate(
    { ...parsed.data, next_run_at: computeNextRunAt(parsed.data) },
    auth.value.id,
  );
  if (!created.ok) return err(created.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "recurring_expense.created",
    entity_type: "recurring_expense_template",
    entity_id: created.value.id,
    after: { name: parsed.data.name, cadence: parsed.data.cadence },
  });

  revalidatePath(RUTIN_GIDERLER_PATH);
  revalidatePath(FINANS_PATH);
  return ok({ id: created.value.id });
}

export async function updateRecurringExpenseTemplateAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = updateRecurringExpenseTemplateSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz rutin gider.",
        details: parsed.error.flatten(),
      }),
    );
  }
  const { id, ...rest } = parsed.data;

  // Editing NEVER touches already-generated expense rows (spec §15) — the
  // repository only writes recurring_expense_templates.
  const updated = await updateTemplate(id, { ...rest, next_run_at: computeNextRunAt(rest) });
  if (!updated.ok) return err(updated.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "recurring_expense.updated",
    entity_type: "recurring_expense_template",
    entity_id: id,
    after: { name: rest.name, cadence: rest.cadence, default_amount_minor: rest.default_amount_minor },
  });

  revalidatePath(RUTIN_GIDERLER_PATH);
  revalidatePath(FINANS_PATH);
  return ok({ id });
}

export async function setRecurringExpenseTemplateActiveAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = setRecurringExpenseTemplateActiveSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz istek." }));
  }

  // Resuming re-anchors next_run_at from today — a template paused for
  // months must not immediately try to back-generate every missed period.
  let nextRunAt: Date | undefined;
  if (parsed.data.active) {
    const existing = await findTemplateById(parsed.data.id);
    if (!existing.ok) return err(existing.error);
    nextRunAt = computeNextRunAt({
      cadence: existing.value.cadence,
      day_of_week: existing.value.day_of_week,
      day_of_month: existing.value.day_of_month,
      start_date: todayInIstanbul(),
    });
  }

  const updated = await setTemplateActive(parsed.data.id, parsed.data.active, nextRunAt);
  if (!updated.ok) return err(updated.error);

  await logAudit({
    actor_id: auth.value.id,
    action: parsed.data.active ? "recurring_expense.resumed" : "recurring_expense.paused",
    entity_type: "recurring_expense_template",
    entity_id: parsed.data.id,
  });

  revalidatePath(RUTIN_GIDERLER_PATH);
  revalidatePath(FINANS_PATH);
  return ok({ id: parsed.data.id });
}

export async function deleteRecurringExpenseTemplateAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = deleteRecurringExpenseTemplateSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz rutin gider." }));
  }

  const deleted = await deleteTemplate(parsed.data.id);
  if (!deleted.ok) return err(deleted.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "recurring_expense.deleted",
    entity_type: "recurring_expense_template",
    entity_id: parsed.data.id,
  });

  revalidatePath(RUTIN_GIDERLER_PATH);
  return ok({ id: parsed.data.id });
}
