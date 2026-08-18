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
import { notifyAdminOfNewOrder } from "@/features/admin-notifications/application/notify-admin-new-order";
import {
  BANK_TRANSFER_ACCOUNT_HOLDER,
  BANK_TRANSFER_BANK_NAME,
  BANK_TRANSFER_IBAN,
  buildBankTransferWhatsAppLink,
} from "@/features/storefront/domain/bank-transfer";
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
    channel: order.channel,
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
    // This path is currently only reached from the PayTR webhook (card
    // payments), but deriving from the order's actual payment_method — rather
    // than assuming "card, so never bank_transfer" — is what keeps this
    // correct if a bank_transfer order is ever routed through here too.
    bankTransfer:
      order.paymentMethod === "bank_transfer"
        ? {
            iban: BANK_TRANSFER_IBAN,
            accountHolder: BANK_TRANSFER_ACCOUNT_HOLDER,
            bankName: BANK_TRANSFER_BANK_NAME,
            whatsappUrl: buildBankTransferWhatsAppLink(order.orderNumber, order.totalMinor),
          }
        : null,
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

  // This path only runs once the PayTR webhook confirms payment actually
  // succeeded — so, unlike the COD/bank path, the admin is notified here
  // rather than at placement (an abandoned card checkout never reaches
  // this function, so it never generates a notification).
  await notifyAdminOfNewOrder({
    orderId,
    orderNumber: order.orderNumber,
    customerName: order.customerName || order.customerEmail,
    channel: order.channel,
    totalMinor: order.totalMinor,
  });

  return sent.value === "skipped_not_configured" ? "skipped_not_configured" : "sent";
}
