"use server";

/**
 * "Siparişimi sorgula" — the form action behind the guest order-tracking page.
 *
 * A POST rather than a query string on purpose: the phone number is the
 * authorization here, and it should not end up in browser history, the referrer
 * header or a shared link.
 */
import { lookupGuestOrder, type GuestOrderView } from "@/features/storefront/application/lookup-guest-order";
import { logger } from "@/shared/logger";
import { normalizeTRPhone } from "@/shared/utils/phone";

export type FindOrderState =
  | { status: "idle" }
  /** `phone` is echoed back so the card can authorise a resume-payment submit
   *  without asking the customer to type it a second time. It is their own
   *  number, just normalised. */
  | { status: "found"; order: GuestOrderView; phone: string }
  | { status: "not_found" }
  | { status: "error"; message: string };

export async function findMyOrderAction(
  _previous: FindOrderState,
  formData: FormData,
): Promise<FindOrderState> {
  const orderNumber = formData.get("order_number");
  const phone = formData.get("phone");
  if (typeof orderNumber !== "string" || typeof phone !== "string") {
    return { status: "not_found" };
  }

  const result = await lookupGuestOrder(orderNumber, phone);
  if (!result.ok) {
    logger.error({ code: result.error.code }, "find_my_order_failed");
    return {
      status: "error",
      message: "Sipariş sorgulanamadı, lütfen tekrar deneyin.",
    };
  }

  // "Wrong phone" and "no such order" answer identically — telling them apart
  // would turn a scan of sequential order numbers into an existence oracle.
  if (!result.value) return { status: "not_found" };

  return {
    status: "found",
    order: result.value,
    phone: normalizeTRPhone(phone) ?? phone,
  };
}
