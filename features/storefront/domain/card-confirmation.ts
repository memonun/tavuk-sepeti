/**
 * When is an unpaid card order "not paid yet" versus "we haven't heard back
 * yet"?
 *
 * PayTR redirects the customer back to the storefront the instant 3-D Secure
 * clears, but the payment is only booked when PayTR's separate server-to-server
 * callback reaches us and its ledger row fires `recompute_order_payment`. The
 * browser wins that race essentially every time. For the seconds in between,
 * `payment_status` still reads 'pending' for a payment that has, in fact,
 * succeeded.
 *
 * Rendering that gap as a red "Ödeme bekliyor" next to a "Ödemeyi tamamla"
 * button is what made customers pay twice, and it is why the storefront and the
 * admin panel appeared to disagree about the same order: the admin grid
 * re-reads on every Postgres change, so it converged on "Ödendi" while the
 * customer's page kept showing the render from before the callback landed.
 *
 * Pure predicates, no I/O — `nowMs` is passed in so this is deterministic and
 * testable, and so a server render and its client re-render agree.
 */

/** Beyond this, an unpaid card order is treated as genuinely unpaid and the
 *  customer is offered the pay-again path. Chosen to sit far above the callback
 *  latency observed in production (~1 minute from order to ledger row) and
 *  inside PayTR's own payment-session timeout, so a real abandonment surfaces
 *  quickly without a successful payment ever being called unpaid. */
export const CARD_CONFIRMATION_GRACE_MS = 15 * 60 * 1000;

export interface PaymentStateView {
  payment_status: string;
  payment_method: string;
  status: string;
  /** ISO timestamp of when the order was placed. */
  created_at: string;
}

/**
 * Is this order actually waiting on money from the customer?
 *
 * `payment_status` alone is not the answer: a cash-on-delivery order is
 * legitimately unpaid right up to the doorstep, so badging it "Ödeme bekliyor"
 * and offering a pay button would be wrong on both counts.
 */
export function isAwaitingPayment(order: PaymentStateView): boolean {
  return (
    order.payment_status !== "paid" &&
    order.status !== "cancelled" &&
    order.payment_method !== "cash_on_delivery"
  );
}

/** True while a card payment may still be in flight — show "kontrol ediliyor",
 *  not "Ödeme bekliyor", and do NOT offer to charge the card again. */
export function isAwaitingCardConfirmation(
  order: PaymentStateView,
  nowMs: number,
): boolean {
  if (!isAwaitingPayment(order)) return false;
  if (order.payment_method !== "credit_card") return false;
  const placedMs = new Date(order.created_at).getTime();
  // An unparseable timestamp must not grant an open-ended grace period; fall
  // back to treating the order as plainly unpaid.
  if (Number.isNaN(placedMs)) return false;
  return nowMs - placedMs < CARD_CONFIRMATION_GRACE_MS;
}

/** A paid order should SAY so. Cash-on-delivery is excluded: it is settled at
 *  the door, so "Ödendi" before the driver arrives would be a lie. */
export function showsPaidBadge(order: {
  payment_status: string;
  payment_method: string;
}): boolean {
  return (
    order.payment_status === "paid" && order.payment_method !== "cash_on_delivery"
  );
}
