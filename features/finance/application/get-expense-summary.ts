import "server-only";

/** Powers the Toplam Gider / Bekleyen Giderler mini-stats at the top of the
 *  Giderler page. */
import { financeExpenseSummary } from "@/features/finance/infrastructure/finance-reporting.repository";
import { AppError } from "@/shared/errors/app-error";
import type { Result } from "@/shared/result";

import type { ExpenseSummaryRow } from "@/features/finance/infrastructure/finance-reporting.repository";

export async function getExpenseSummary(
  from: string,
  to: string,
): Promise<Result<ExpenseSummaryRow, AppError>> {
  return financeExpenseSummary(from, to);
}
