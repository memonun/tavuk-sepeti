import "server-only";

import { collectSelfAndDescendantIds } from "@/features/finance/domain/expense-category";
import { expenseListQuerySchema } from "@/features/finance/domain/expense.schema";
import { listExpenseCategoriesFlat } from "@/features/finance/application/list-expense-categories";
import { listExpenses as repoListExpenses } from "@/features/finance/infrastructure/expense.repository";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, type Result } from "@/shared/result";

import type { ExpenseListFilter, ListExpensesResult } from "@/features/finance/infrastructure/expense.repository";

export type { Expense, ExpensePaymentStatus, ExpenseUnit, ManualPaymentMethod } from "@/features/finance/domain/expense";
export { EXPENSE_UNIT_LABELS, EXPENSE_PAYMENT_STATUS_LABELS, MANUAL_PAYMENT_METHOD_LABELS } from "@/features/finance/domain/expense";

export async function listExpenses(
  rawQuery: unknown,
): Promise<Result<ListExpensesResult, AppError>> {
  const parsed = expenseListQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.flatten() }, "list_expenses_invalid_query");
    return err(
      new ValidationError({
        message: "Geçersiz arama parametresi.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const { category_id, ...rest } = parsed.data;
  const filter: ExpenseListFilter = rest;

  // A top-level category selection includes all its children (spec §19); a
  // child (or childless top-level) selection filters to just that id.
  if (category_id) {
    const categories = await listExpenseCategoriesFlat();
    if (!categories.ok) return err(categories.error);
    filter.category_ids = collectSelfAndDescendantIds(categories.value, category_id);
  }

  return repoListExpenses(filter);
}
