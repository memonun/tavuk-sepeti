/**
 * Composed shape returned by get-finance-summary — everything Finans Özeti's
 * cards and bars need for one period. All money in kuruş.
 */
import type { FinanceChannel } from "@/features/finance/domain/finance-channel";

export type FinanceDateBasis = "scheduled_for" | "created_at";

export interface FinanceChannelRevenue {
  readonly channel: FinanceChannel;
  readonly label: string;
  readonly revenueMinor: number;
  readonly orderCount: number;
}

export interface FinanceLocationRevenue {
  readonly locationId: string;
  readonly locationName: string;
  readonly revenueMinor: number;
  readonly saleCount: number;
}

export interface FinanceSummary {
  readonly period: { readonly from: string; readonly to: string; readonly dateBasis: FinanceDateBasis };
  readonly totalRevenueMinor: number;
  readonly collectedMinor: number;
  readonly expectedPaymentsMinor: number;
  readonly totalExpensesMinor: number;
  readonly pendingExpensesMinor: number;
  readonly paidExpensesMinor: number;
  readonly netDurumMinor: number;
  readonly channelBreakdown: readonly FinanceChannelRevenue[];
  readonly marketByLocation: readonly FinanceLocationRevenue[];
  // Gider Dağılımı (Ana Kategoriler/Detay) is fetched separately — see
  // features/finance/application/get-expense-category-breakdown.ts — since
  // it needs category hierarchy the plain expense-summary RPCs don't carry.
}
