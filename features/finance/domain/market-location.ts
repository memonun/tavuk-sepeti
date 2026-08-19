/**
 * A physical market stall (pazar) Apuhan Çiftliği sells at. Currently two,
 * but the table (and this type) never assumes exactly two — see
 * 20260819210100_finance_market_sales.sql.
 */

export interface MarketLocation {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly created_at: Date;
}
