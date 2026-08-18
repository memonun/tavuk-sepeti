"use server";

/**
 * "Sipariş numarası ile bul" — the second tab on the guest order-tracking
 * page, for someone who has the order number but doesn't want to (or can't)
 * re-enter the phone it was placed with. Asks for nothing else — see
 * lookup-guest-order-by-number.ts for the security trade-off that implies.
 */
import { headers } from "next/headers";

import { lookupGuestOrderByNumber } from "@/features/storefront/application/lookup-guest-order-by-number";
import type { GuestOrderView } from "@/features/storefront/application/lookup-guest-order";
import { logger } from "@/shared/logger";

export type FindOrderByNumberState =
  | { status: "idle" }
  | { status: "found"; order: GuestOrderView }
  | { status: "not_found" }
  | { status: "rate_limited" }
  | { status: "error"; message: string };

export async function findGuestOrderByNumberAction(
  _previous: FindOrderByNumberState,
  formData: FormData,
): Promise<FindOrderByNumberState> {
  const orderNumber = formData.get("order_number");
  if (typeof orderNumber !== "string" || orderNumber.trim() === "") {
    return { status: "not_found" };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  const result = await lookupGuestOrderByNumber(orderNumber, ip);
  if (!result.ok) {
    if (result.error.code === "RATE_LIMITED") return { status: "rate_limited" };
    logger.error({ code: result.error.code }, "find_guest_order_by_number_failed");
    return { status: "error", message: "Sipariş sorgulanamadı, lütfen tekrar deneyin." };
  }

  if (!result.value) return { status: "not_found" };
  return { status: "found", order: result.value };
}
