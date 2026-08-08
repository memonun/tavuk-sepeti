import "server-only";

/**
 * Sends the order-confirmation e-mail for an already-placed order, reading the
 * order facts back from the database instead of taking them from the caller.
 *
 * This exists because the CARD path can't send the e-mail inline: placeOrder
 * redirects to PayTR before the order is paid, and the only moment we know the
 * payment succeeded is the webhook — a request that carries no session and no
 * basket. So the payments feature calls in here (cross-feature imports go
 * through application/, CLAUDE.md §2) and the confirmation e-mail keeps living
 * in the feature that owns it.
 *
 * Best-effort like every other e-mail in the system: a failure is logged and
 * reported, never thrown. A missed receipt must not cost us the "OK" that stops
 * PayTR from retrying a payment we already booked.
 */
import { buildOrderConfirmationEmail } from "@/features/storefront/domain/order-email";
import {
  PAYMENT_METHOD_OPTIONS,
  TIME_SLOT_OPTIONS,
} from "@/features/storefront/domain/storefront.config";
import { getOrderConfirmationSnapshot } from "@/features/storefront/infrastructure/order-confirmation.repository";
import { logger } from "@/shared/logger";
import { sendEmail } from "@/shared/email/send-email";

export type ConfirmationOutcome =
  | "sent"
  | "skipped_no_email"
  | "skipped_not_configured"
  | "failed";

export async function sendOrderConfirmationEmail(
  orderId: string,
): Promise<ConfirmationOutcome> {
  const snapshot = await getOrderConfirmationSnapshot(orderId);
  if (!snapshot.ok) {
    logger.error(
      { orderId, code: snapshot.error.code },
      "order_confirmation_snapshot_failed",
    );
    return "failed";
  }

  const order = snapshot.value;
  if (!order.customerEmail) {
    logger.info({ orderId }, "order_confirmation_skipped_no_email");
    return "skipped_no_email";
  }

  const email = buildOrderConfirmationEmail({
    orderNumber: order.orderNumber,
    customerName: order.customerName || order.customerEmail,
    scheduledFor: order.scheduledFor,
    timeSlotLabel:
      TIME_SLOT_OPTIONS.find((option) => option.value === order.timeSlot)?.label ??
      null,
    paymentMethodLabel:
      PAYMENT_METHOD_OPTIONS.find((option) => option.value === order.paymentMethod)
        ?.label ?? order.paymentMethod,
    addressText: order.addressText,
    items: order.items,
    subtotalMinor: order.subtotalMinor,
    deliveryFeeMinor: order.deliveryFeeMinor,
    totalMinor: order.totalMinor,
  });

  const sent = await sendEmail({
    to: order.customerEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  if (!sent.ok) {
    logger.warn({ orderId, code: sent.error.code }, "order_confirmation_email_failed");
    return "failed";
  }

  return sent.value === "skipped_not_configured" ? "skipped_not_configured" : "sent";
}
