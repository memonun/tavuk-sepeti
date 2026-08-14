/**
 * The out-of-city (cargo) order floor.
 *
 * Shipping a parcel across Türkiye costs the same whether the box holds one
 * kilo of apricots or ten, so below a certain basket the order loses money.
 * The owner set that floor at 1.000 ₺ for cargo orders only — a home-delivery
 * order rides an existing route and has no such floor.
 *
 * Pure: the checkout calls it to disable the submit with a precise "how much
 * more" message, and `placeOrderAction` calls it again on the RE-PRICED
 * subtotal, which is the only number that decides.
 */
import { formatTRY } from "@/shared/utils/money";

import type { FulfillmentChannel } from "@/features/storefront/domain/fulfillment-channel";

export interface OrderMinimumCheck {
  /** True when this basket may be ordered. */
  readonly ok: boolean;
  /** Kuruş still missing; 0 when the basket already clears the floor. */
  readonly shortfallMinor: number;
}

/**
 * `channel` is the re-derived channel, not the customer's choice: a basket with
 * any fresh line is a delivery order (the cargo-able goods ride along in the
 * van), so it is never held to the cargo floor.
 */
export function checkOrderMinimum(
  channel: FulfillmentChannel,
  subtotalMinor: number,
  minOrderMinor: number,
): OrderMinimumCheck {
  if (channel !== "shipping" || minOrderMinor <= 0) {
    return { ok: true, shortfallMinor: 0 };
  }
  const shortfall = minOrderMinor - subtotalMinor;
  return shortfall > 0
    ? { ok: false, shortfallMinor: shortfall }
    : { ok: true, shortfallMinor: 0 };
}

/**
 * Customer-facing message. Says the limit AND what is missing — a bare
 * "minimum 1.000 ₺" leaves the customer doing the arithmetic.
 *
 * "Kargolu", not "Şehir dışı". The floor follows the CHANNEL, and
 * `resolveOrderChannel` decides that purely from whether the basket holds a
 * fresh line — geography never enters into it. A Malatya customer buying only
 * pekmez gets a cargo basket, and telling them the limit applies to
 * "şehir dışı" orders reads as "not you" while the button stays disabled.
 */
export function orderMinimumMessage(
  minOrderMinor: number,
  shortfallMinor: number,
): string {
  return `Kargolu siparişlerde alt limit ${formatTRY(
    minOrderMinor,
  )}. Sepetinize ${formatTRY(shortfallMinor)} daha eklemeniz gerekiyor.`;
}

/** Short notice shown before the basket falls short — the rule, not the gap. */
export function orderMinimumNotice(minOrderMinor: number): string {
  return `Kargolu siparişlerde alt limit ${formatTRY(minOrderMinor)}.`;
}
