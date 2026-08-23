"use server";

/**
 * Expense category Server Actions. Pattern: assertAdmin → Zod parse → repo →
 * logAudit → revalidatePath → ok() (features/finance/application/expense-actions.ts).
 */
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import {
  createExpenseCategorySchema,
  setExpenseCategoryActiveSchema,
  updateExpenseCategorySchema,
} from "@/features/finance/domain/expense-category.schema";
import {
  createExpenseCategory,
  setExpenseCategoryActive,
  updateExpenseCategory,
} from "@/features/finance/infrastructure/expense-category.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

const GIDERLER_PATH = "/finans/giderler";

export async function createExpenseCategoryAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = createExpenseCategorySchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz kategori.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const created = await createExpenseCategory(parsed.data);
  if (!created.ok) return err(created.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "expense_category.created",
    entity_type: "expense_category",
    entity_id: created.value.id,
    after: { name: parsed.data.name, parent_id: parsed.data.parent_id },
  });

  revalidatePath(GIDERLER_PATH);
  return ok({ id: created.value.id });
}

export async function updateExpenseCategoryAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = updateExpenseCategorySchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz kategori.",
        details: parsed.error.flatten(),
      }),
    );
  }
  const { id, ...rest } = parsed.data;

  const updated = await updateExpenseCategory(id, rest);
  if (!updated.ok) return err(updated.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "expense_category.updated",
    entity_type: "expense_category",
    entity_id: id,
    after: { name: rest.name, parent_id: rest.parent_id },
  });

  revalidatePath(GIDERLER_PATH);
  return ok({ id });
}

export async function setExpenseCategoryActiveAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = setExpenseCategoryActiveSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz istek." }));
  }

  const updated = await setExpenseCategoryActive(parsed.data.id, parsed.data.active);
  if (!updated.ok) return err(updated.error);

  await logAudit({
    actor_id: auth.value.id,
    action: parsed.data.active ? "expense_category.reactivated" : "expense_category.archived",
    entity_type: "expense_category",
    entity_id: parsed.data.id,
    after: { active: parsed.data.active },
  });

  revalidatePath(GIDERLER_PATH);
  return ok({ id: parsed.data.id });
}
