"use server";

/**
 * Expense CRUD Server Actions. Pattern: assertAdmin → Zod parse → repo →
 * logAudit → revalidatePath → ok() (features/products/application/create-product.ts).
 */
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import {
  createExpenseSchema,
  deleteExpenseSchema,
  markExpensePaidSchema,
  updateExpenseSchema,
} from "@/features/finance/domain/expense.schema";
import {
  createExpense,
  deleteExpense,
  findExpenseById,
  markExpensePaid,
  updateExpense,
} from "@/features/finance/infrastructure/expense.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

const GIDERLER_PATH = "/finans/giderler";
const FINANS_PATH = "/finans";

export async function createExpenseAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = createExpenseSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz gider.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const created = await createExpense({ ...parsed.data, created_by: auth.value.id });
  if (!created.ok) return err(created.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "expense.created",
    entity_type: "expense",
    entity_id: created.value,
    after: { category: parsed.data.category, amount_minor: parsed.data.amount_minor },
  });

  revalidatePath(GIDERLER_PATH);
  revalidatePath(FINANS_PATH);
  return ok({ id: created.value });
}

export async function updateExpenseAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = updateExpenseSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz gider.",
        details: parsed.error.flatten(),
      }),
    );
  }
  const { id, ...rest } = parsed.data;

  const updated = await updateExpense(id, rest);
  if (!updated.ok) return err(updated.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "expense.updated",
    entity_type: "expense",
    entity_id: id,
    after: { category: rest.category, amount_minor: rest.amount_minor },
  });

  revalidatePath(GIDERLER_PATH);
  revalidatePath(FINANS_PATH);
  return ok({ id });
}

export async function deleteExpenseAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = deleteExpenseSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz gider." }));
  }

  const deleted = await deleteExpense(parsed.data.id);
  if (!deleted.ok) return err(deleted.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "expense.deleted",
    entity_type: "expense",
    entity_id: parsed.data.id,
  });

  revalidatePath(GIDERLER_PATH);
  revalidatePath(FINANS_PATH);
  return ok({ id: parsed.data.id });
}

export async function markExpensePaidAction(
  raw: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = markExpensePaidSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz istek." }));
  }

  const existing = await findExpenseById(parsed.data.id);
  if (!existing.ok) return err(existing.error);

  const paymentMethod = parsed.data.payment_method ?? existing.value.payment_method ?? "cash";
  const marked = await markExpensePaid(parsed.data.id, paymentMethod);
  if (!marked.ok) return err(marked.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "expense.paid",
    entity_type: "expense",
    entity_id: parsed.data.id,
    after: { payment_method: paymentMethod },
  });

  revalidatePath(GIDERLER_PATH);
  revalidatePath(FINANS_PATH);
  return ok({ id: parsed.data.id });
}
