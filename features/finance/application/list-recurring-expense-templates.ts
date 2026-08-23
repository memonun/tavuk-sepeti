import "server-only";

import { listExpenseCategoriesFlat } from "@/features/finance/application/list-expense-categories";
import { listAllTemplates } from "@/features/finance/infrastructure/recurring-expense-template.repository";
import { AppError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

import type { ExpenseCategory } from "@/features/finance/domain/expense-category";
import type {
  RecurringExpenseTemplate,
  RecurringExpenseTemplateListItem,
} from "@/features/finance/domain/recurring-expense-template";

/** Raw templates (not the compact list-item projection) — the edit dialog
 *  needs every field, the list item only carries what the table renders. */
export async function listRecurringExpenseTemplatesFull(): Promise<
  Result<RecurringExpenseTemplate[], AppError>
> {
  return listAllTemplates();
}

export async function listRecurringExpenseTemplates(): Promise<
  Result<RecurringExpenseTemplateListItem[], AppError>
> {
  const [templatesRes, categoriesRes] = await Promise.all([
    listAllTemplates(),
    listExpenseCategoriesFlat(),
  ]);
  if (!templatesRes.ok) return err(templatesRes.error);
  if (!categoriesRes.ok) return err(categoriesRes.error);

  const categoryById = new Map<string, ExpenseCategory>(categoriesRes.value.map((c) => [c.id, c]));

  return ok(
    templatesRes.value.map((tpl) => {
      const category = categoryById.get(tpl.category_id);
      const parent = category?.parent_id ? categoryById.get(category.parent_id) : undefined;
      return {
        id: tpl.id,
        name: tpl.name,
        category_id: tpl.category_id,
        category_name: category?.name ?? "—",
        category_parent_name: parent?.name ?? null,
        vendor: tpl.vendor,
        amount_type: tpl.amount_type,
        default_amount_minor: tpl.default_amount_minor,
        cadence: tpl.cadence,
        day_of_week: tpl.day_of_week,
        day_of_month: tpl.day_of_month,
        active: tpl.active,
        next_run_at: tpl.next_run_at,
        end_date: tpl.end_date,
      };
    }),
  );
}
