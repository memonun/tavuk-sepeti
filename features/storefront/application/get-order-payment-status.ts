import "server-only";

/**
 * Read one of the caller's own orders' payment state.
 *
 * Exists for the PayTR return page. That page used to assert "Ödemeniz alındı!"
 * and empty the basket on the strength of a browser redirect alone — its only
 * input was `?no=` in the URL. A redirect is not a payment: PayTR sends the
 * customer to `ok_url` independently of whether our server-to-server callback
 * succeeded, so a 400 there (or an app restart, or a bookmark, or the back
 * button) produced a customer reading "payment received" over an order that is
 * permanently unpaid — with their basket already destroyed.
 *
 * `order_payments` is the ledger, but `orders.payment_status` is what the
 * callback stamps once a payment is booked, so that is the flag to trust here.
 *
 * Scoped explicitly to the caller's customer row rather than left to RLS: the
 * admin policy has no row filter, so an unfiltered lookup by order number would
 * answer for somebody else's order.
 */
import { logger } from "@/shared/logger";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export type OrderPaymentState = "paid" | "unpaid" | "unknown";

export async function getMyOrderPaymentState(
  orderNumber: string | null,
): Promise<OrderPaymentState> {
  if (!orderNumber) return "unknown";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "unknown";

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (customerError) {
    logger.warn({ code: customerError.code }, "payment_state_customer_failed");
    return "unknown";
  }
  if (!customer) return "unknown";

  const { data: order, error } = await supabase
    .from("orders")
    .select("payment_status")
    .eq("order_number", orderNumber)
    .eq("customer_id", customer.id)
    .maybeSingle();
  if (error) {
    logger.warn({ code: error.code }, "payment_state_order_failed");
    return "unknown";
  }
  if (!order) return "unknown";

  return order.payment_status === "paid" ? "paid" : "unpaid";
}
