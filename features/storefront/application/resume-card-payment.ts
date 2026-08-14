"use server";

/**
 * Pay an order that already exists.
 *
 * Before this, a failed or abandoned card payment had no route back. The
 * failure page offered "Tekrar dene → /odeme", which re-runs the whole checkout
 * action and writes a SECOND order; production shows one customer placing four
 * card orders in four minutes that way, and two others giving up and re-placing
 * the identical basket as havale. The first attempt stayed behind as an unpaid
 * row that only a manual DELETE cleared.
 *
 * Resuming is safe because `merchant_oid` is `orderId + timestamp`
 * (features/payments/domain/paytr.ts): a new attempt gets a distinct oid, so
 * PayTR treats it as a new payment while our callback still resolves it back to
 * the same order. Booking is idempotent on the ledger side, so a late
 * notification for the earlier attempt cannot double-charge the order.
 *
 * Deliberately does NOT re-price: the order is frozen, and the amount handed to
 * PayTR must equal `orders.total_minor` or the callback's amount check rejects
 * the payment.
 */
import { headers } from "next/headers";

import { createPaytrPaymentSession, isPaytrEnabled } from "@/features/payments/application/paytr";
import { getOrderConfirmationSnapshot } from "@/features/storefront/infrastructure/order-confirmation.repository";
import { logger } from "@/shared/logger";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export type ResumePaymentState =
  | { status: "idle" }
  | { status: "redirect"; url: string }
  | { status: "error"; message: string };

export async function resumeCardPaymentAction(
  _previous: ResumePaymentState,
  formData: FormData,
): Promise<ResumePaymentState> {
  const orderNumber = formData.get("order_number");
  if (typeof orderNumber !== "string" || orderNumber === "") {
    return { status: "error", message: "Sipariş bulunamadı." };
  }

  if (!isPaytrEnabled()) {
    return {
      status: "error",
      message: "Kart ile ödeme şu anda kullanılamıyor. Havale ile ödeyebilirsiniz.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Oturumunuz sonlanmış. Tekrar giriş yapın." };
  }

  // Scoped to the caller's own customer row — the admin RLS policy has no row
  // filter, so a lookup by order number alone would resolve someone else's order.
  const { data: customer } = await supabase
    .from("customers")
    .select("id,phone")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!customer) {
    return { status: "error", message: "Profiliniz bulunamadı." };
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select("id,status,payment_status,total_minor")
    .eq("order_number", orderNumber)
    .eq("customer_id", customer.id)
    .maybeSingle();
  if (error) {
    logger.error({ code: error.code }, "resume_payment_order_lookup_failed");
    return { status: "error", message: "Sipariş okunamadı, tekrar deneyin." };
  }
  if (!order) return { status: "error", message: "Sipariş bulunamadı." };

  if (order.payment_status === "paid") {
    return { status: "error", message: "Bu sipariş zaten ödenmiş." };
  }
  if (order.status === "cancelled") {
    return { status: "error", message: "Bu sipariş iptal edilmiş." };
  }
  // The callback rejects a payment whose amount doesn't match the order, so a
  // null total is not something to coerce past — it means the row is unusable.
  if (order.total_minor === null) {
    logger.error({ orderNumber }, "resume_payment_order_has_no_total");
    return { status: "error", message: "Sipariş tutarı okunamadı, bize yazın." };
  }

  // Reads through the service-role client, so ownership MUST already be
  // established — it is, by the customer-scoped lookup above. Reusing the
  // confirmation snapshot keeps the PayTR basket identical to the one the
  // receipt e-mail describes.
  const snapshot = await getOrderConfirmationSnapshot(order.id);
  if (!snapshot.ok) {
    logger.error({ code: snapshot.error.code }, "resume_payment_snapshot_failed");
    return { status: "error", message: "Sipariş okunamadı, tekrar deneyin." };
  }

  const email = snapshot.value.customerEmail ?? user.email;
  if (!email) {
    return {
      status: "error",
      message: "Kart ile ödeme için e-posta adresi gerekli. Profilinizden ekleyin.",
    };
  }

  // Line totals plus the fee, so PayTR's basket sums to the charged amount.
  const basket = snapshot.value.items.map((item) => ({
    label: `${item.name} × ${item.quantity.toLocaleString("tr-TR", {
      maximumFractionDigits: 2,
    })}`,
    totalMinor: item.lineTotalMinor,
  }));
  if (snapshot.value.deliveryFeeMinor > 0) {
    basket.push({
      label: "Teslimat ücreti",
      totalMinor: snapshot.value.deliveryFeeMinor,
    });
  }

  const hdrs = await headers();
  const userIp =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";

  const session = await createPaytrPaymentSession({
    orderId: order.id,
    orderNumber,
    amountMinor: order.total_minor,
    email,
    userName: snapshot.value.customerName || email,
    userAddress: snapshot.value.addressText,
    userPhone: customer.phone ?? "",
    userIp,
    basket,
    nowMs: Date.now(),
  });
  if (!session.ok) {
    logger.error({ code: session.error.code }, "resume_payment_session_failed");
    return {
      status: "error",
      message: "Ödeme başlatılamadı. Lütfen tekrar deneyin veya havale ile ödeyin.",
    };
  }

  return { status: "redirect", url: session.value.paymentUrl };
}
