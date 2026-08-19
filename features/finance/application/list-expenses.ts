import "server-only";

import { expenseListQuerySchema } from "@/features/finance/domain/expense.schema";
import { listExpenses as repoListExpenses } from "@/features/finance/infrastructure/expense.repository";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, type Result } from "@/shared/result";

import type { ListExpensesResult } from "@/features/finance/infrastructure/expense.repository";

export type { Expense, ExpensePaymentStatus, ManualPaymentMethod } from "@/features/finance/domain/expense";
export { EXPENSE_CATEGORY_OPTIONS, EXPENSE_PAYMENT_STATUS_LABELS, MANUAL_PAYMENT_METHOD_LABELS } from "@/features/finance/domain/expense";

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
  return repoListExpenses(parsed.data);
}
