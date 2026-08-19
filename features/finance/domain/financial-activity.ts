/**
 * "Son Finansal Hareketler" feed entries. Each item communicates what
 * happened in plain Turkish — no table/column names leak into the label.
 */
export type FinancialActivityKind = "order_payment" | "expense" | "market_sale";

export interface FinancialActivityItem {
  readonly id: string;
  readonly kind: FinancialActivityKind;
  readonly description: string;
  readonly amountMinor: number;
  readonly occurredAt: Date;
}
