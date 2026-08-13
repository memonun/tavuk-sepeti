/**
 * Which payment methods a basket may use.
 *
 * The rule that matters here: **kapıda nakit ödeme is home-delivery only**. Our
 * driver can take cash at the door; a cargo courier cannot collect on our
 * behalf, so an out-of-city order is prepaid (card or havale) or it is not
 * placed at all.
 *
 * Pure and client-safe on purpose — the checkout renders exactly the options
 * this returns, and `placeOrderAction` calls `isPaymentMethodAllowed` again on
 * the RE-DERIVED channel, so a hand-crafted submit cannot buy a cargo parcel on
 * COD.
 */
import { PAYMENT_METHOD_OPTIONS } from "@/features/storefront/domain/storefront.config";

import type { FulfillmentChannel } from "@/features/storefront/domain/fulfillment-channel";

export type PaymentMethod = (typeof PAYMENT_METHOD_OPTIONS)[number]["value"];

export interface PaymentMethodOption {
  readonly value: PaymentMethod;
  readonly label: string;
}

/** The methods offered for a channel, in display order. */
export function paymentMethodsForChannel(
  channel: FulfillmentChannel,
): readonly PaymentMethodOption[] {
  return PAYMENT_METHOD_OPTIONS.filter((option) =>
    (option.channels as readonly FulfillmentChannel[]).includes(channel),
  ).map((option) => ({ value: option.value, label: option.label }));
}

export function isPaymentMethodAllowed(
  method: PaymentMethod,
  channel: FulfillmentChannel,
): boolean {
  return paymentMethodsForChannel(channel).some(
    (option) => option.value === method,
  );
}

/** Customer-facing reason, so a rejected method explains itself. */
export function paymentMethodBlockedMessage(method: PaymentMethod): string {
  return method === "cash_on_delivery"
    ? "Kapıda nakit ödeme yalnızca eve servis siparişlerinde geçerlidir. Kargo siparişleri için kart veya havale seçin."
    : "Bu ödeme yöntemi bu sipariş için kullanılamıyor.";
}
