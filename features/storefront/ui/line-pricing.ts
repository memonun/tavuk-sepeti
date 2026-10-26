/**
 * Thin UI helpers that price a catalog Product for display, delegating to the
 * products feature's pricing engine (single source of truth, client-safe
 * re-export). Used by the storefront cards / cart / checkout summary. The
 * authoritative price is still recomputed on the server at checkout.
 */
import {
  discountPercent,
  priceOrderLine,
  productLinePricing,
} from "@/features/products/application/pricing";

import type { Product } from "@/features/products/application/list-products";

/** Exact line total (kuruş) for a quantity — sale price included. */
export function lineTotalMinor(product: Product, quantity: number): number {
  return priceOrderLine(quantity, productLinePricing(product)).line_total_minor;
}

/** The "from" price shown on a card — the per-unit price at the product's minimum qty. */
export function fromPriceMinor(product: Product): number {
  return priceOrderLine(product.min_qty, productLinePricing(product)).unit_price_minor;
}

/** The same line without the sale price (tiers + base only). */
function regularLine(product: Product, quantity: number) {
  return priceOrderLine(quantity, {
    tiers: product.price_tiers,
    basePriceMinor: product.current_unit_price_minor,
  });
}

/** A struck-through "eski fiyat": the regular amount and the whole-percent saving. */
export interface SaleSaving {
  readonly regularMinor: number;
  readonly percent: number;
}

function saving(regularMinor: number, actualMinor: number): SaleSaving | null {
  const percent = discountPercent(regularMinor, actualMinor);
  return percent === null ? null : { regularMinor, percent };
}

/**
 * The sale's saving on a line, or null when the product is not on sale or the
 * sale doesn't lower this line (volume tiers already cheaper).
 */
export function lineSale(product: Product, quantity: number): SaleSaving | null {
  if (product.discount_unit_price_minor === null || quantity <= 0) return null;
  return saving(
    regularLine(product, quantity).line_total_minor,
    lineTotalMinor(product, quantity),
  );
}

/** {@link lineSale} for the card's "from" (per-unit at min qty) price. */
export function fromPriceSale(product: Product): SaleSaving | null {
  if (product.discount_unit_price_minor === null) return null;
  return saving(
    regularLine(product, product.min_qty).unit_price_minor,
    fromPriceMinor(product),
  );
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
