import "server-only";

/**
 * Powers the "Ana Kategoriler | Detay" toggle on Gider Dağılımı (spec §18).
 * Kept separate from get-finance-summary.ts (which still carries the flat,
 * V1-shaped `expenseBreakdown` via financeExpenseBreakdown) so the summary
 * page's default render isn't forced to fetch the hierarchical shape it
 * doesn't need.
 */
import { rollupToParentAmounts } from "@/features/finance/domain/expense-category";
import { financeExpenseCategoryBreakdown } from "@/features/finance/infrastructure/finance-reporting.repository";
import type { AppError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

import type { CategoryAmount, ParentCategoryAmount } from "@/features/finance/domain/expense-category";

export interface ExpenseCategoryBreakdown {
  byParent: ParentCategoryAmount[];
  byCategory: CategoryAmount[];
}

export async function getExpenseCategoryBreakdown(
  from: string,
  to: string,
): Promise<Result<ExpenseCategoryBreakdown, AppError>> {
  const rowsRes = await financeExpenseCategoryBreakdown(from, to);
  if (!rowsRes.ok) return err(rowsRes.error);

  const byCategory: CategoryAmount[] = rowsRes.value.map((row) => ({
    categoryId: row.category_id,
    categoryName: row.category_name,
    parentId: row.parent_id,
    parentName: row.parent_name,
    amountMinor: row.amount_minor,
  }));

  return ok({
    byParent: rollupToParentAmounts(byCategory),
    byCategory: [...byCategory].sort((a, b) => b.amountMinor - a.amountMinor),
  });
}
