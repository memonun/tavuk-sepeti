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
  trackAddPaymentInfo,
  trackAddShippingInfo,
  trackAddToCart,
  trackInitiateCheckout,
  trackLead,
  trackPurchase,
  trackRemoveFromCart,
  trackViewCart,
  trackViewContent,
  type MetaContent,
} from "@/shared/analytics/meta-pixel";
import { fromPriceMinor, lineTotalMinor } from "@/features/storefront/ui/line-pricing";

import type { Product } from "@/features/products/application/list-products";
import type { OrderPurchase } from "@/features/storefront/domain/order-purchase.schema";

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

type BasketRows = ReadonlyArray<{ product: Product; quantity: number }>;

function contentsOf(rows: BasketRows): MetaContent[] {
  return rows.map((r) => ({ id: r.product.key, quantity: r.quantity }));
}

function subtotalOf(rows: BasketRows): number {
  return rows.reduce((sum, r) => sum + lineTotalMinor(r.product, r.quantity), 0);
}

/** "+" on a line already in the basket: the ADDED amount, priced as the
 *  difference of the two line totals so quantity tiers stay honest. */
export function trackProductQuantityIncreased(product: Product, from: number, to: number): void {
  try {
    if (!(to > from)) return;
    trackAddToCart({
      productId: product.key,
      productName: product.display_name,
      quantity: to - from,
      valueMinor: Math.max(0, lineTotalMinor(product, to) - lineTotalMinor(product, from)),
    });
  } catch {
    /* never throw */
  }
}

/** "−", "Çıkar" (to = 0) or "Sepeti boşalt": the REMOVED amount and value. */
export function trackProductQuantityDecreased(product: Product, from: number, to: number): void {
  try {
    if (!(from > to)) return;
    const remaining = to > 0 ? lineTotalMinor(product, to) : 0;
    trackRemoveFromCart({
      productId: product.key,
      productName: product.display_name,
      quantity: from - to,
      valueMinor: Math.max(0, lineTotalMinor(product, from) - remaining),
    });
  } catch {
    /* never throw */
  }
}

/** The basket panel was opened. */
export function trackCartViewed(rows: BasketRows): void {
  try {
    trackViewCart({ contents: contentsOf(rows), valueMinor: subtotalOf(rows) });
  } catch {
    /* never throw */
  }
}

/** A delivery address is in place at checkout. `addressKey` only tells one
 *  address from another for dedupe; nothing about the address is sent. */
export function trackShippingInfoAdded(
  rows: BasketRows,
  channel: "delivery" | "shipping",
  addressKey: string,
): void {
  try {
    trackAddShippingInfo({
      contents: contentsOf(rows),
      valueMinor: subtotalOf(rows),
      shippingTier: channel === "delivery" ? "eve_teslimat" : "kargo",
      addressKey,
    });
  } catch {
    /* never throw */
  }
}

/** The order form was submitted with this payment method and on-screen total. */
export function trackPaymentInfoAdded(
  rows: BasketRows,
  paymentMethod: string,
  totalMinor: number,
): void {
  try {
    trackAddPaymentInfo({ contents: contentsOf(rows), valueMinor: totalMinor, paymentMethod });
  } catch {
    /* never throw */
  }
}

/** A recurring-order request went in. */
export function trackRecurringRequested(
  items: ReadonlyArray<{ product_key: string; quantity: number }>,
): void {
  try {
    trackLead({
      category: "duzenli_siparis",
      contents: items.map((i) => ({ id: i.product_key, quantity: i.quantity })),
    });
  } catch {
    /* never throw */
  }
}

/**
 * A short, non-reversible tag for a value — used to tell one guest address
 * from another for event dedupe without keeping the address itself around.
 * Not cryptographic and never sent to Meta.
 */
export function opaqueKey(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/** The customer reached checkout with these basket rows. */
export function trackCheckoutStarted(rows: BasketRows): void {
  try {
    trackInitiateCheckout({ contents: contentsOf(rows), valueMinor: subtotalOf(rows) });
  } catch {
    /* never throw */
  }
}

/**
 * An order is complete. `purchase` must come from the SERVER — the placed
 * order's own total and lines, never the browser's basket: for kapıda ödeme /
 * havale that is `placeOrderAction`'s success state, for a card order the
 * paid-order read behind the return page. Reported at most once per order
 * number per browser (see `trackPurchase`).
 */
export function trackOrderPurchased(purchase: OrderPurchase): void {
  try {
    trackPurchase({
      orderId: purchase.orderNumber,
      contents: purchase.items.map((item) => ({ id: item.productKey, quantity: item.quantity })),
      valueMinor: purchase.totalMinor,
    });
  } catch {
    /* never throw */
  }
}

/**
 * A product detail page (/urun/[slug]) was shown — see meta-product-view-tracker.tsx.
 * `value` is the "from" unit price the page shows, the same figure the
 * merchant feed lists, so a catalog ad and the event agree on the price.
 */
export function trackProductViewed(product: Product): void {
  try {
    trackViewContent({
      productId: product.key,
      productName: product.display_name,
      valueMinor: fromPriceMinor(product),
    });
  } catch {
    /* never throw */
  }
}
