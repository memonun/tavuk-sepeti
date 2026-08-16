/**
 * Thin UI helpers that price a catalog Product for display, delegating to the
 * products feature's pricing engine (single source of truth, client-safe
 * re-export). Used by the storefront cards / cart / checkout summary. The
 * authoritative price is still recomputed on the server at checkout.
 */
import { priceOrderLine, rateForQuantity } from "@/features/products/application/pricing";

import type { Product } from "@/features/products/application/list-products";

/** Per-unit rate (kuruş) for a given quantity — tier-aware. */
export function unitRateMinor(product: Product, quantity: number): number {
  return rateForQuantity(quantity, {
    tiers: product.price_tiers,
    basePriceMinor: product.current_unit_price_minor,
  });
}

/** Exact line total (kuruş) for a quantity. */
export function lineTotalMinor(product: Product, quantity: number): number {
  return priceOrderLine(quantity, {
    tiers: product.price_tiers,
    basePriceMinor: product.current_unit_price_minor,
  }).line_total_minor;
}

/** The "from" price shown on a card — the rate at the product's minimum qty. */
export function fromPriceMinor(product: Product): number {
  return unitRateMinor(product, product.min_qty);
}

/** True when the product has more than one tier (a visible volume discount). */
export function hasVolumeDiscount(product: Product): boolean {
  return product.price_tiers.length > 1;
}

/**
 * True for products sold in half-unit (0.5 kg) increments — cross-referenced
 * against `step` rather than `unit`/`unit_label`, since those are free admin
 * text and inconsistent (several kilogram products have `unit_label: "1"`).
 * `step === 0.5` is the one field that's actually authoritative about
 * whether a half-kilo purchase is possible.
 */
export function hasHalfUnitOption(product: Product): boolean {
  return product.step === 0.5;
}

/** The price (kuruş) for buying exactly half a unit — only meaningful when
 *  {@link hasHalfUnitOption} is true. */
export function halfUnitPriceMinor(product: Product): number {
  return lineTotalMinor(product, 0.5);
}
