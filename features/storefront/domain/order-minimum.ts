/**
 * Order floors, per channel.
 *
 * Shipping a parcel across Türkiye costs the same whether the box holds one
 * kilo of apricots or ten, so below a certain basket the order loses money —
 * the owner's cargo floor (1.000 ₺ at launch). A delivery-channel order rides
 * an existing route rather than a dedicated shipment, but it isn't free to
 * run either, hence a separate, lower eve-servis floor (250 ₺ at launch) —
 * including a basket the address-aware channel resolution upgraded from
 * shipping (features/storefront/domain/fulfillment-channel.ts).
 *
 * Pure: the checkout calls it to disable the submit with a precise "how much
 * more" message, and `placeOrderAction` calls it again on the RE-PRICED
 * subtotal, which is the only number that decides. The caller picks which
 * floor applies (`channel === "delivery" ? homeMinOrderMinor :
 * cargoMinOrderMinor`) — this module only does the arithmetic and the wording.
 */
import { formatTRY } from "@/shared/utils/money";

import type { FulfillmentChannel } from "@/features/storefront/domain/fulfillment-channel";

export interface OrderMinimumCheck {
  /** True when this basket may be ordered. */
  readonly ok: boolean;
  /** Kuruş still missing; 0 when the basket already clears the floor. */
  readonly shortfallMinor: number;
}

/** `minOrderMinor` is whichever floor applies to the caller's channel; 0 disables it. */
export function checkOrderMinimum(
  subtotalMinor: number,
  minOrderMinor: number,
): OrderMinimumCheck {
  if (minOrderMinor <= 0) {
    return { ok: true, shortfallMinor: 0 };
  }
  const shortfall = minOrderMinor - subtotalMinor;
  return shortfall > 0
    ? { ok: false, shortfallMinor: shortfall }
    : { ok: true, shortfallMinor: 0 };
}

const CHANNEL_LABEL: Record<FulfillmentChannel, string> = {
  delivery: "Eve servis",
  shipping: "Şehir dışı (kargo)",
};

/** Customer-facing message. Says the limit AND what is missing — a bare
 *  "minimum 1.000 ₺" leaves the customer doing the arithmetic. */
export function orderMinimumMessage(
  channel: FulfillmentChannel,
  minOrderMinor: number,
  shortfallMinor: number,
): string {
  return `${CHANNEL_LABEL[channel]} siparişlerinde alt limit ${formatTRY(
    minOrderMinor,
  )}. Sepetinize ${formatTRY(shortfallMinor)} daha eklemeniz gerekiyor.`;
}

/** Short notice shown before the basket falls short — the rule, not the gap. */
export function orderMinimumNotice(
  channel: FulfillmentChannel,
  minOrderMinor: number,
): string {
  return `${CHANNEL_LABEL[channel]} siparişlerinde alt limit ${formatTRY(minOrderMinor)}.`;
}
