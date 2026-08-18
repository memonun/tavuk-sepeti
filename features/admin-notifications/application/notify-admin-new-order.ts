import "server-only";

/**
 * Best-effort admin notification for a newly-placed order: an in-panel bell
 * row + (if ADMIN_NOTIFICATION_EMAIL is set) an e-mail. Called from the SAME
 * two points the customer confirmation e-mail is sent from — COD/bank
 * transfer orders inline at placement, card orders from the PayTR webhook
 * once payment actually succeeds (features/storefront/application/
 * place-order.ts and send-order-confirmation.ts) — so the admin is never
 * notified about a card order that was abandoned before paying.
 *
 * Never throws and never returns a Result: a notification failure must not
 * roll back or block the order flow that just succeeded, same contract as
 * sendEmail()/logAudit().
 */
import { buildNewOrderNotificationEmail } from "@/features/admin-notifications/domain/notification-email";
import { insertNotification } from "@/features/admin-notifications/infrastructure/notifications.repository";
import { env } from "@/shared/env";
import { logger } from "@/shared/logger";
import { sendEmail } from "@/shared/email/send-email";
import { formatTRY } from "@/shared/utils/money";

export interface NewOrderNotificationInput {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly customerName: string;
  readonly channel: "delivery" | "shipping";
  readonly totalMinor: number;
}

export async function notifyAdminOfNewOrder(
  input: NewOrderNotificationInput,
): Promise<void> {
  const channelLabel = input.channel === "shipping" ? "Kargo" : "Malatya içi teslimat";
  const inserted = await insertNotification({
    type: "order_created",
    title: `Yeni sipariş — ${input.orderNumber}`,
    body: `${input.customerName || "Müşteri"} · ${channelLabel} · ${formatTRY(input.totalMinor)}`,
    link: `/orders/${input.orderId}`,
    orderId: input.orderId,
  });
  if (!inserted.ok) {
    logger.warn({ code: inserted.error.code, orderId: input.orderId }, "new_order_notification_insert_failed");
  }

  if (!env.ADMIN_NOTIFICATION_EMAIL) return;
  const email = buildNewOrderNotificationEmail(input);
  const sent = await sendEmail({
    to: env.ADMIN_NOTIFICATION_EMAIL,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  if (!sent.ok) {
    logger.warn({ code: sent.error.code, orderId: input.orderId }, "new_order_notification_email_failed");
  }
}
