import "server-only";

/**
 * "Yaklaşan Rutin Giderler" compact card on Finans Özeti (spec §20) — the
 * first few rows of the same overview the admin Panel shows in full, so the
 * two can never disagree. Read-only; the materialization driver
 * (materialize-due-recurring-expenses.ts) is the only thing that turns a
 * template into a real expense row.
 */
import { getRecurringExpenseOverview } from "@/features/finance/application/get-recurring-expense-overview";
import { AppError } from "@/shared/errors/app-error";
import { todayInIstanbul } from "@/shared/utils/date";
import { err, ok, type Result } from "@/shared/result";

import type { UpcomingRecurringExpense } from "@/features/finance/domain/recurring-expense-template";

const DEFAULT_LIMIT = 5;

export async function getUpcomingRecurringExpenses(
  limit = DEFAULT_LIMIT,
): Promise<Result<UpcomingRecurringExpense[], AppError>> {
  const overview = await getRecurringExpenseOverview(todayInIstanbul());
  if (!overview.ok) return err(overview.error);

  return ok(
    overview.value.items.slice(0, limit).map((item) => ({
      templateId: item.templateId,
      name: item.name,
      categoryLabel: item.categoryLabel,
      amountMinor: item.amountMinor,
      isEstimate: item.isEstimate,
      // Noon Istanbul on the due day: formatDate() renders the right calendar
      // day whatever the server's own timezone is.
      nextRunAt: new Date(`${item.dueDate}T12:00:00+03:00`),
    })),
  );
}
