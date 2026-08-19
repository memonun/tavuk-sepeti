/**
 * Orders grid row-status wash — a supplementary visual cue layered on top
 * of the existing icon+text status badges (never the sole signal, WCAG
 * 1.4.1). Rules per business request:
 *   pending                       → purple
 *   confirmed                     → yellow
 *   delivered + paid              → green
 *   delivered + not paid          → red
 *   anything else (shipped, …)    → no wash
 *
 * `PAID_ROW_BACKGROUND` is exported separately so the "Ödeme" column can
 * highlight a paid order's own cell even when the row itself has no wash
 * (e.g. a paid-but-not-yet-delivered order).
 */
import type { OrderListItem } from "@/features/orders/domain/order";

export const PAID_ROW_BACKGROUND = "var(--row-status-paid)";

export function getOrderRowBackground(order: OrderListItem): string | undefined {
  if (order.status === "pending") return "var(--row-status-pending)";
  if (order.status === "confirmed") return "var(--row-status-confirmed)";
  if (order.status === "delivered") {
    return order.payment_status === "paid"
      ? PAID_ROW_BACKGROUND
      : "var(--row-status-unpaid)";
  }
  return undefined;
}
