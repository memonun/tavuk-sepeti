"use server";

/**
 * "Siparişimi sorgula" — the form action behind the guest order-tracking page.
 *
 * A POST rather than a query string on purpose: the phone number is the
 * authorization here, and it should not end up in browser history, the
 * referrer header or a shared link.
 *
 * Replaces the old order_number + phone lookup: order_number is a dead end
 * for anyone who lost the confirmation e-mail, so the guest now identifies
 * their order by phone + order date + order type instead. The server
 * resolves the real order_number/order_id itself.
 */
import { headers } from "next/headers";

import { guestOrderLookupSchema } from "@/features/storefront/domain/guest-order-lookup.schema";
import { lookupGuestOrdersByDetails } from "@/features/storefront/application/lookup-guest-orders-by-details";
import type { GuestOrderView } from "@/features/storefront/application/lookup-guest-order";
import { logger } from "@/shared/logger";

export type FindOrdersState =
  | { status: "idle" }
  | { status: "found_one"; order: GuestOrderView; phone: string }
  | { status: "found_many"; orders: GuestOrderView[]; phone: string }
  | { status: "not_found" }
  | { status: "rate_limited" }
  | { status: "error"; message: string };

export async function findGuestOrdersAction(
  _previous: FindOrdersState,
  formData: FormData,
): Promise<FindOrdersState> {
  const parsed = guestOrderLookupSchema.safeParse({
    phone: formData.get("phone"),
    order_date: formData.get("order_date"),
    order_type: formData.get("order_type"),
  });
  // Same non-disclosure principle as the old order_number+phone lookup: an
  // invalid submission and a real "no match" both read as not_found, never a
  // field-specific message.
  if (!parsed.success) return { status: "not_found" };

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  const result = await lookupGuestOrdersByDetails(
    parsed.data.phone,
    parsed.data.order_date,
    parsed.data.order_type,
    ip,
  );
  if (!result.ok) {
    if (result.error.code === "RATE_LIMITED") return { status: "rate_limited" };
    logger.error({ code: result.error.code }, "find_guest_orders_failed");
    return { status: "error", message: "Sipariş sorgulanamadı, lütfen tekrar deneyin." };
  }

  const [firstOrder] = result.value;
  if (!firstOrder) return { status: "not_found" };
  if (result.value.length === 1) {
    return { status: "found_one", order: firstOrder, phone: parsed.data.phone };
  }
  return { status: "found_many", orders: result.value, phone: parsed.data.phone };
}
