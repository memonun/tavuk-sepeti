"use client";

/**
 * Reports Meta Pixel InitiateCheckout when /odeme is opened with a non-empty
 * basket. A separate component (rather than an effect inside CheckoutForm) so
 * the working checkout form is not touched at all. Renders nothing; a no-op
 * without a Pixel ID (and not even mounted then — see app/(shop)/odeme/page.tsx).
 *
 * Waits for the persisted basket to hydrate (`hydrated`) so an empty first
 * render is never mistaken for an empty basket, and resolves lines against the
 * live catalog so a stranded/removed product is not reported.
 */
import { useEffect } from "react";

import { trackCheckoutStarted } from "@/features/storefront/ui/meta-events";
import { useCart } from "@/features/storefront/ui/cart-provider";

import type { Product } from "@/features/products/application/list-products";

export function MetaCheckoutTracker({ products }: { products: readonly Product[] }) {
  const { lines, hydrated } = useCart();

  useEffect(() => {
    if (!hydrated || lines.length === 0) return;
    const byKey = new Map(products.map((p) => [p.key, p]));
    const rows = lines.flatMap((line) => {
      const product = byKey.get(line.product_key);
      return product ? [{ product, quantity: line.quantity }] : [];
    });
    if (rows.length > 0) trackCheckoutStarted(rows);
  }, [hydrated, lines, products]);

  return null;
}
