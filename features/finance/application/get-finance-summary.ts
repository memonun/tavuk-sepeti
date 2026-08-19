import "server-only";

/**
 * Orchestrates the Finans Özeti dashboard: fires all finance_* RPCs in
 * parallel for one period and composes the result. Read-only, called
 * directly from the Server Component page — no "use server" directive
 * needed (that's reserved for actions a Client Component invokes).
 */
import { FINANCE_CHANNEL_LABELS } from "@/features/finance/domain/finance-channel";
import { financeSummaryQuerySchema } from "@/features/finance/domain/finance-query.schema";
import { calculateNetDurum } from "@/features/finance/domain/net-durum";
import {
  financeCollectedAmount,
  financeExpectedPayments,
  financeExpenseBreakdown,
  financeExpenseSummary,
  financeMarketRevenue,
  financeRevenueByChannel,
} from "@/features/finance/infrastructure/finance-reporting.repository";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { AppError, ValidationError } from "@/shared/errors/app-error";

import type { FinanceSummary } from "@/features/finance/domain/finance-summary";

export async function getFinanceSummary(
  rawQuery: unknown,
): Promise<Result<FinanceSummary, AppError>> {
  const parsed = financeSummaryQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.flatten() }, "get_finance_summary_invalid_query");
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz dönem.",
        details: parsed.error.flatten(),
      }),
    );
  }
  const { from, to, dateBasis } = parsed.data;

  const [channelRes, marketRes, collectedRes, expectedRes, expenseSummaryRes, expenseBreakdownRes] =
    await Promise.all([
      financeRevenueByChannel(from, to, dateBasis),
      financeMarketRevenue(from, to),
      financeCollectedAmount(from, to),
      financeExpectedPayments(from, to, dateBasis),
      financeExpenseSummary(from, to),
      financeExpenseBreakdown(from, to),
    ]);

  if (!channelRes.ok) return err(channelRes.error);
  if (!marketRes.ok) return err(marketRes.error);
  if (!collectedRes.ok) return err(collectedRes.error);
  if (!expectedRes.ok) return err(expectedRes.error);
  if (!expenseSummaryRes.ok) return err(expenseSummaryRes.error);
  if (!expenseBreakdownRes.ok) return err(expenseBreakdownRes.error);

  const marketRevenueMinor = marketRes.value.reduce((acc, r) => acc + r.revenue_minor, 0);
  const onlineRevenueMinor = channelRes.value.reduce((acc, r) => acc + r.revenue_minor, 0);
  const collectedMinor = collectedRes.value.orders_minor + collectedRes.value.market_minor;
  const netDurumMinor = calculateNetDurum(collectedMinor, expenseSummaryRes.value.paid_minor);

  const channelBreakdown = [
    ...channelRes.value.map((row) => ({
      channel: row.channel,
      label: FINANCE_CHANNEL_LABELS[row.channel],
      revenueMinor: row.revenue_minor,
      orderCount: row.order_count,
    })),
    {
      channel: "market" as const,
      label: FINANCE_CHANNEL_LABELS.market,
      revenueMinor: marketRevenueMinor,
      orderCount: marketRes.value.reduce((acc, r) => acc + r.sale_count, 0),
    },
  ];

  const summary: FinanceSummary = {
    period: { from, to, dateBasis },
    totalRevenueMinor: onlineRevenueMinor + marketRevenueMinor,
    collectedMinor,
    expectedPaymentsMinor: expectedRes.value,
    totalExpensesMinor: expenseSummaryRes.value.total_minor,
    pendingExpensesMinor: expenseSummaryRes.value.pending_minor,
    paidExpensesMinor: expenseSummaryRes.value.paid_minor,
    netDurumMinor,
    channelBreakdown,
    marketByLocation: marketRes.value.map((row) => ({
      locationId: row.location_id,
      locationName: row.location_name,
      revenueMinor: row.revenue_minor,
      saleCount: row.sale_count,
    })),
    expenseBreakdown: expenseBreakdownRes.value.map((row) => ({
      category: row.category,
      amountMinor: row.amount_minor,
    })),
  };

  return ok(summary);
}
