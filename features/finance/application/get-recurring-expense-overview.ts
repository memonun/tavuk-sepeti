import "server-only";

/**
 * Feeds "Yaklaşan Rutin Giderler" (admin Panel + Finans Özeti): unpaid
 * generated occurrences plus the next not-yet-generated one per template.
 * Read-only — materialization is a separate, explicit call the page makes
 * first (materialize-due-recurring-expenses.ts).
 */
import { listExpenseCategoriesFlat } from "@/features/finance/application/list-expense-categories";
import { formatCategoryPath } from "@/features/finance/domain/expense-category";
import {
  buildRecurringExpenseOverview,
  type RecurringExpenseOverview,
  type TemplateInfo,
} from "@/features/finance/domain/recurring-expense-overview";
import {
  listAllTemplates,
  listPendingRecurringExpenses,
} from "@/features/finance/infrastructure/recurring-expense-template.repository";
import { AppError } from "@/shared/errors/app-error";
import { toIstanbulDateString } from "@/shared/utils/date";
import { err, ok, type Result } from "@/shared/result";

import type { ExpenseCategory } from "@/features/finance/domain/expense-category";

export async function getRecurringExpenseOverview(
  today: string,
): Promise<Result<RecurringExpenseOverview, AppError>> {
  const [templatesRes, categoriesRes, pendingRes] = await Promise.all([
    listAllTemplates(),
    listExpenseCategoriesFlat(),
    listPendingRecurringExpenses(),
  ]);
  if (!templatesRes.ok) return err(templatesRes.error);
  if (!categoriesRes.ok) return err(categoriesRes.error);
  if (!pendingRes.ok) return err(pendingRes.error);

  const categoryById = new Map<string, ExpenseCategory>(categoriesRes.value.map((c) => [c.id, c]));
  const labelFor = (categoryId: string): string => {
    const category = categoryById.get(categoryId);
    const parent = category?.parent_id ? categoryById.get(category.parent_id) : undefined;
    return category ? formatCategoryPath(category.name, parent?.name ?? null) : "—";
  };

  const templateInfo = new Map<string, TemplateInfo>();
  for (const tpl of templatesRes.value) {
    templateInfo.set(tpl.id, {
      name: tpl.name,
      categoryLabel: labelFor(tpl.category_id),
      isEstimate: tpl.amount_type === "variable",
    });
  }

  return ok(
    buildRecurringExpenseOverview({
      today,
      templates: templateInfo,
      pending: pendingRes.value.map((r) => ({
        expenseId: r.expense_id,
        templateId: r.template_id,
        dueDate: r.expense_date,
        amountMinor: r.amount_minor,
        paymentMethod: r.payment_method,
        vendor: r.vendor,
      })),
      planned: templatesRes.value
        .filter((tpl) => tpl.active)
        .map((tpl) => ({
          templateId: tpl.id,
          name: tpl.name,
          categoryLabel: labelFor(tpl.category_id),
          vendor: tpl.vendor,
          amountMinor: tpl.default_amount_minor,
          isEstimate: tpl.amount_type === "variable",
          paymentMethod: tpl.payment_method,
          nextDueDate: toIstanbulDateString(tpl.next_run_at),
          endDate: tpl.end_date,
        })),
    }),
  );
}
