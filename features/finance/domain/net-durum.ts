/**
 * "Net Durum" — a simple operational cash-oriented indicator, deliberately
 * NOT accounting profit (no accrued expenses, no depreciation, no COGS).
 * Collected money minus paid-out expenses for the same period.
 */
export function calculateNetDurum(
  collectedMinor: number,
  paidExpensesMinor: number,
): number {
  return collectedMinor - paidExpensesMinor;
}
