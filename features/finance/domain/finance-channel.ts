/**
 * Finans reporting channels. This is a pure read-time classification for
 * the finance dashboard — it never writes back to `orders.fulfillment_channel`
 * (that stays frozen at order time and drives routing/cargo-exclusion, per
 * features/orders/domain/order.ts). A wholesale customer's weekly egg order
 * still rides the normal delivery route; it just *reports* as Toptan Satış.
 *
 * `classifyFinanceChannel` mirrors the SQL CASE in
 * finance_revenue_by_channel (20260819210200_finance_reporting_rpcs.sql)
 * exactly — same "one rule, two implementations, tested on the TS side"
 * pattern the codebase already uses for derivePaymentStatus mirroring
 * recompute_order_payment (features/orders/domain/payment.ts).
 */

export type FinanceChannel =
  | "local_delivery"
  | "recurring"
  | "cargo"
  | "wholesale"
  | "market";

export const FINANCE_CHANNEL_LABELS: Readonly<Record<FinanceChannel, string>> = {
  local_delivery: "Malatya Eve Servis",
  recurring: "Düzenli Sipariş",
  cargo: "Kargolu Sipariş",
  wholesale: "Toptan Satış",
  market: "Pazar Satışı",
};

export interface ChannelClassificationInput {
  readonly fulfillmentChannel: "delivery" | "shipping";
  readonly recurringTemplateId: string | null;
  readonly customerAccountType: string | null;
  readonly customerOrderType: string | null;
}

/** Priority: wholesale customer > recurring template > cargo > local
 *  delivery. "market" isn't produced here — it's a separate table
 *  (market_sales), summed separately (finance_market_revenue). */
export function classifyFinanceChannel(
  input: ChannelClassificationInput,
): Exclude<FinanceChannel, "market"> {
  if (input.customerAccountType === "business" || input.customerOrderType === "wholesale") {
    return "wholesale";
  }
  if (input.recurringTemplateId !== null) {
    return "recurring";
  }
  if (input.fulfillmentChannel === "shipping") {
    return "cargo";
  }
  return "local_delivery";
}
