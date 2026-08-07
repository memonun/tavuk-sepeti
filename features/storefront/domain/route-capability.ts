/**
 * Can this saved address take a VAN delivery (fresh products), or only cargo?
 *
 * Two call sites ask this — the checkout address picker (which disables the
 * ones that cannot) and the account address book (which badges them) — and they
 * must never disagree, so the rule lives here instead of being re-typed in each
 * component.
 *
 * The rule is two-part:
 *
 *   1. A pin. (0,0) is the repo-wide "no pin" sentinel; a route stop without a
 *      confirmed coordinate is exactly what the van cannot serve.
 *   2. The right province. This part exists because a CARGO address now keeps
 *      its pin too: a customer in İstanbul who picked their door on the map has
 *      a perfectly valid coordinate, and offering that address for a van
 *      delivery would let them choose it only to have the order rejected at
 *      submit.
 *
 * Deliberately NOT keyed on `geo_verified`. That flag is only true when the
 * PostGIS polygon answered "inside", so if the service area is unconfigured it
 * is false for everyone — and this predicate would disable every address in the
 * province. `save-address.ts` guards the same failure with the same province
 * fallback; the two stay consistent.
 *
 * This is a UI-honesty hint, never the authority. The server re-checks the
 * service area when the address is saved and again inside the order
 * transaction.
 */
import { isSameProvince } from "@/shared/geo/tr-province";

import { DELIVERY_PROVINCE } from "@/features/storefront/domain/storefront.config";

export interface RouteCapabilityInput {
  readonly lat: number;
  readonly lng: number;
  readonly city: string | null | undefined;
}

/** True when the address carries a pin — (0,0) is the "no pin" sentinel. */
export function hasPin(address: Pick<RouteCapabilityInput, "lat" | "lng">): boolean {
  return address.lat !== 0 || address.lng !== 0;
}

export function isRouteCapable(address: RouteCapabilityInput): boolean {
  return hasPin(address) && isSameProvince(address.city, DELIVERY_PROVINCE);
}

/** Why an address cannot take a van delivery — drives the message shown. */
export type RouteBlockReason = "no_pin" | "other_province";

export function routeBlockReason(
  address: RouteCapabilityInput,
): RouteBlockReason | null {
  if (!hasPin(address)) return "no_pin";
  if (!isSameProvince(address.city, DELIVERY_PROVINCE)) return "other_province";
  return null;
}
