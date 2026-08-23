import "server-only";

import { buildCategoryTree } from "@/features/finance/domain/expense-category";
import { listExpenseCategories as repoListExpenseCategories } from "@/features/finance/infrastructure/expense-category.repository";
import type { AppError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

import type { ExpenseCategory, ExpenseCategoryNode } from "@/features/finance/domain/expense-category";

export type { ExpenseCategory, ExpenseCategoryNode };

/** Tree-shaped, for the category selector / management dialog. Includes
 *  archived categories — callers that only want ones usable on a NEW
 *  expense should run the result through activeCategoryNodes(). */
export async function listExpenseCategoryTree(): Promise<Result<ExpenseCategoryNode[], AppError>> {
  const flat = await repoListExpenseCategories();
  if (!flat.ok) return err(flat.error);
  return ok(buildCategoryTree(flat.value));
}

/** Flat list — used by the application layer to expand a category_id filter
 *  to itself + descendants (features/finance/domain/expense-category.ts's
 *  collectSelfAndDescendantIds) before querying expenses. */
export async function listExpenseCategoriesFlat(): Promise<Result<ExpenseCategory[], AppError>> {
  return repoListExpenseCategories();
}
