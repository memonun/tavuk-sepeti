/**
 * The fee a storefront order pays to reach the customer, per channel.
 *
 * One function on purpose: the checkout summary (display) and place-order.ts
 * (what is actually written to the order and charged through PayTR) both call
 * it, so the total a customer sees can never differ from the total charged.
 *
 *   - delivery (eve servis, Malatya içi): the flat `homeDeliveryFeeMinor`.
 *   - shipping (kargo, şehir dışı): the flat `cargoFeeMinor`, waived once the
 *     subtotal reaches `cargoFreeShippingThresholdMinor` ("1.000 ₺ ve üzeri
 *     ücretsiz kargo" — inclusive). A threshold of 0 means there is no
 *     free-shipping offer; a fee of 0 means cargo is always free.
 *
 * Pure and client-safe. Money is kuruş (CLAUDE.md §7).
 */
import type { FulfillmentChannel } from "@/features/storefront/domain/fulfillment-channel";
import type { StorefrontSettings } from "@/features/storefront/domain/storefront-settings";

export type OrderFeeRates = Pick<
  StorefrontSettings,
  "homeDeliveryFeeMinor" | "cargoFeeMinor" | "cargoFreeShippingThresholdMinor"
>;

/** True when a cargo order of this subtotal ships for free. */
export function qualifiesForFreeCargo(
  subtotalMinor: number,
  rates: OrderFeeRates,
): boolean {
  if (rates.cargoFeeMinor === 0) return true;
  return (
    rates.cargoFreeShippingThresholdMinor > 0 &&
    subtotalMinor >= rates.cargoFreeShippingThresholdMinor
  );
}

export function orderFeeMinor(
  channel: FulfillmentChannel,
  subtotalMinor: number,
  rates: OrderFeeRates,
): number {
  if (channel === "delivery") return rates.homeDeliveryFeeMinor;
  return qualifiesForFreeCargo(subtotalMinor, rates) ? 0 : rates.cargoFeeMinor;
}

/**
 * How much more a cargo basket needs for free shipping, or null when that
 * question does not apply (cargo already free, no threshold, or reached).
 */
export function freeCargoShortfallMinor(
  subtotalMinor: number,
  rates: OrderFeeRates,
): number | null {
  if (qualifiesForFreeCargo(subtotalMinor, rates)) return null;
  if (rates.cargoFreeShippingThresholdMinor === 0) return null;
  return rates.cargoFreeShippingThresholdMinor - subtotalMinor;
}
