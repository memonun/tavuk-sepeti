import "server-only";

/**
 * "Yaklaşan Rutin Giderler" (Finans Özeti, spec §20) — a read-only preview
 * of each active template's OWN next_run_at. Never writes anything; the
 * materialization driver (materialize-due-recurring-expenses.ts) is the
 * only thing that turns a template into a real expense row.
 */
import { formatCategoryPath } from "@/features/finance/domain/expense-category";
import { listExpenseCategoriesFlat } from "@/features/finance/application/list-expense-categories";
import { listAllTemplates } from "@/features/finance/infrastructure/recurring-expense-template.repository";
import { AppError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

import type { ExpenseCategory } from "@/features/finance/domain/expense-category";
import type { UpcomingRecurringExpense } from "@/features/finance/domain/recurring-expense-template";

const DEFAULT_LIMIT = 5;

export async function getUpcomingRecurringExpenses(
  limit = DEFAULT_LIMIT,
): Promise<Result<UpcomingRecurringExpense[], AppError>> {
  const [templatesRes, categoriesRes] = await Promise.all([
    listAllTemplates(),
    listExpenseCategoriesFlat(),
  ]);
  if (!templatesRes.ok) return err(templatesRes.error);
  if (!categoriesRes.ok) return err(categoriesRes.error);

  const categoryById = new Map<string, ExpenseCategory>(categoriesRes.value.map((c) => [c.id, c]));

  const upcoming: UpcomingRecurringExpense[] = templatesRes.value
    .filter((tpl) => tpl.active)
    .sort((a, b) => a.next_run_at.getTime() - b.next_run_at.getTime())
    .slice(0, limit)
    .map((tpl) => {
      const category = categoryById.get(tpl.category_id);
      const parent = category?.parent_id ? categoryById.get(category.parent_id) : undefined;
      return {
        templateId: tpl.id,
        name: tpl.name,
        categoryLabel: category ? formatCategoryPath(category.name, parent?.name ?? null) : "—",
        amountMinor: tpl.default_amount_minor,
        isEstimate: tpl.amount_type === "variable",
        nextRunAt: tpl.next_run_at,
      };
    });

  return ok(upcoming);
}
