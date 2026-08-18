import "server-only";

/**
 * Best-effort admin notification for a new customer recurring-order request:
 * an in-panel bell row + (if ADMIN_NOTIFICATION_EMAIL is set) an e-mail.
 * Called right after createCustomerRecurringTemplate() succeeds
 * (features/storefront/application/recurring-order-request.ts).
 *
 * Reads the template + customer name back by id — mirrors
 * sendOrderConfirmationEmail(orderId)'s "read facts back from the database"
 * pattern — rather than threading the customer's name through the caller.
 *
 * Never throws and never returns a Result, same contract as
 * notify-admin-new-order.ts: a notification failure must not affect the
 * request the customer just submitted.
 */
import { buildRecurringRequestNotificationEmail } from "@/features/admin-notifications/domain/notification-email";
import { insertNotification } from "@/features/admin-notifications/infrastructure/notifications.repository";
import { env } from "@/shared/env";
import { logger } from "@/shared/logger";
import { sendEmail } from "@/shared/email/send-email";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";

type Cadence = "weekly" | "biweekly" | "monthly";

export async function notifyAdminOfRecurringRequest(templateId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("recurring_templates" as any)
    .select("customer_id, cadence, items, customers(id, first_name, last_name)")
    .eq("id", templateId)
    .maybeSingle();

  if (error || !data) {
    logger.warn(
      { code: error?.code, templateId },
      "recurring_request_notification_lookup_failed",
    );
    return;
  }

  const row = data as unknown as {
    customer_id: string;
    cadence: Cadence;
    items: unknown;
    customers: { id: string; first_name: string | null; last_name: string | null } | null;
  };
  const customerName = [row.customers?.first_name, row.customers?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const itemCount = Array.isArray(row.items) ? row.items.length : 0;

  const inserted = await insertNotification({
    type: "recurring_request",
    title: "Yeni düzenli sipariş talebi",
    body: `${customerName || "Müşteri"} · ${itemCount} ürün`,
    link: `/customers/${row.customer_id}`,
    recurringTemplateId: templateId,
  });
  if (!inserted.ok) {
    logger.warn(
      { code: inserted.error.code, templateId },
      "recurring_request_notification_insert_failed",
    );
  }

  if (!env.ADMIN_NOTIFICATION_EMAIL) return;
  const email = buildRecurringRequestNotificationEmail({
    customerName,
    cadence: row.cadence,
    itemCount,
  });
  const sent = await sendEmail({
    to: env.ADMIN_NOTIFICATION_EMAIL,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  if (!sent.ok) {
    logger.warn(
      { code: sent.error.code, templateId },
      "recurring_request_notification_email_failed",
    );
  }
}
