"use client";

/**
 * Storefront → Meta Pixel event mapping: turns catalog products / basket rows
 * into the neutral inputs of shared/analytics/meta-pixel.ts. Every function is a
 * silent no-op while no Pixel ID is configured, and none can throw.
 *
 * Money is derived from the same client-safe pricing the basket already shows
 * (lineTotalMinor) — it is a reporting figure, never a charge; the server
 * re-prices the order at checkout.
 */
import {
  trackAddToCart,
  trackInitiateCheckout,
  trackViewContent,
} from "@/shared/analytics/meta-pixel";
import { lineTotalMinor } from "@/features/storefront/ui/line-pricing";

import type { Product } from "@/features/products/application/list-products";

/** A product was actually added to the basket (call AFTER the cart mutation). */
export function trackProductAddedToCart(product: Product, quantity: number): void {
  try {
    trackAddToCart({
      productId: product.key,
      productName: product.display_name,
      quantity,
      valueMinor: lineTotalMinor(product, quantity),
    });
  } catch {
    /* never throw */
  }
}

/** The customer reached checkout with these basket rows. */
export function trackCheckoutStarted(
  rows: ReadonlyArray<{ product: Product; quantity: number }>,
): void {
  try {
    trackInitiateCheckout({
      contents: rows.map((r) => ({ id: r.product.key, quantity: r.quantity })),
      valueMinor: rows.reduce((sum, r) => sum + lineTotalMinor(r.product, r.quantity), 0),
    });
  } catch {
    /* never throw */
  }
}

/** READY, NOT CALLED: the storefront has no product detail page yet. */
export function trackProductViewed(product: Product): void {
  try {
    trackViewContent({
      productId: product.key,
      productName: product.display_name,
      valueMinor: lineTotalMinor(product, product.min_qty),
    });
  } catch {
    /* never throw */
  }
}
