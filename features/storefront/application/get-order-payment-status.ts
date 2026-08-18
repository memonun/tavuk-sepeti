import "server-only";

/**
 * Read one order's payment state for the PayTR return page.
 *
 * That page used to assert "Ödemeniz alındı!" and empty the basket on the
 * strength of a browser redirect alone — its only input was `?no=` in the URL.
 * A redirect is not a payment: PayTR sends the customer to `ok_url`
 * independently of whether our server-to-server callback succeeded.
 *
 * But the opposite failure is the common one, and it is what this module now
 * exists to survive: PayTR redirects the browser IMMEDIATELY while the callback
 * that actually books the payment lands seconds later. Read once, at the moment
 * the customer arrives, and the answer is almost always "unpaid" — for a
 * payment that completes fine a moment afterwards. So this is written to be
 * POLLED (see `checkOrderPaymentState`), not called once.
 *
 * Two ways to be authorized, in this order:
 *   1. A session whose customer row owns the order. Scoped explicitly rather
 *      than left to RLS: the admin policy has no row filter, so an unfiltered
 *      lookup by order number would answer for somebody else's order.
 *   2. The `t` token from the return URL we handed PayTR. This is what makes
 *      the page work for a GUEST — before it, `getMyOrderPaymentState` returned
 *      "unknown" for anyone without a login, so every guest card payer was told
 *      "Ödemeniz kontrol ediliyor" forever and never had their basket cleared.
 *
 * `order_payments` is the ledger, but `orders.payment_status` is what the
 * callback's trigger stamps once a payment is booked, so that is the flag to
 * trust here.
 */
import { verifyPaytrReturnToken } from "@/features/payments/application/paytr";
import { readOrderPaymentStatus } from "@/features/storefront/infrastructure/order-payment-state.repository";
import { logger } from "@/shared/logger";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export type OrderPaymentState = "paid" | "unpaid" | "unknown";

export interface OrderPaymentStateInput {
  orderNumber: string | null;
  /** `t` from the card-return URL. Absent for a customer who navigated here. */
  returnToken?: string | null | undefined;
}

/**
 * Session-scoped read: the caller's own order, or "unknown".
 *
 * Kept separate from the token path so the session — when there is one —
 * remains the authorization, and a token is never able to widen what a
 * logged-in customer can see.
 */
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

/**
 * The return page's read: session first, then the signed return token.
 *
 * Falls through to the token only when the session can't answer, so a customer
 * who is logged in as somebody else can't use a stray token to read an order
 * that isn't theirs — the session branch already returned "unknown" for a
 * non-owned order, and the token branch requires a token minted for exactly
 * this order number.
 */
export async function getReturnPaymentState(
  input: OrderPaymentStateInput,
): Promise<OrderPaymentState> {
  const { orderNumber, returnToken } = input;
  if (!orderNumber) return "unknown";

  const fromSession = await getMyOrderPaymentState(orderNumber);
  if (fromSession !== "unknown") return fromSession;

  if (!returnToken) return "unknown";
  if (!verifyPaytrReturnToken(orderNumber, returnToken)) {
    logger.warn({}, "payment_state_bad_return_token");
    return "unknown";
  }

  const status = await readOrderPaymentStatus(orderNumber);
  if (!status.ok || status.value === null) return "unknown";

  return status.value === "paid" ? "paid" : "unpaid";
}
