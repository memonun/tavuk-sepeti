"use client";

/**
 * Reports a Meta Pixel ViewContent when a product detail page (/urun/[slug])
 * is shown. Renders nothing; mounted by that page only when a Pixel ID is set.
 *
 * One report per product per mount: the ref absorbs React strict-mode effect
 * re-runs and re-renders, while a client-side move to another product page
 * (same component, new product) or coming back to this one reports again —
 * each of those is a new view.
 */
import { useEffect, useRef } from "react";

import type { Product } from "@/features/products/application/list-products";
import { trackProductViewed } from "@/features/storefront/ui/meta-events";

export function MetaProductViewTracker({ product }: { product: Product }) {
  const reportedKey = useRef<string | null>(null);

  useEffect(() => {
    if (reportedKey.current === product.key) return;
    reportedKey.current = product.key;
    trackProductViewed(product);
  }, [product]);

  return null;
}
