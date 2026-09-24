/**
 * Catalog-price estimate for a market sale's product sheet — a convenience to
 * fill the "Toplam Tutar" box, never authoritative: stall prices can differ
 * from the catalog, which is why the total stays a typed field.
 *
 * Client-safe (no server-only): the sale form calls it while typing. Pricing
 * comes from the products feature's shared engine so tiers (e.g. cheaper eggs
 * per pack at volume) are applied exactly as on orders.
 */
import { priceOrderLine } from "@/features/products/application/pricing";

import type { MarketProductOption } from "@/features/finance/domain/market-sale-products";

export function estimateSoldItemsMinor(
  items: ReadonlyArray<{ product_key: string; quantity: number }>,
  products: ReadonlyArray<MarketProductOption>,
): number {
  const byKey = new Map(products.map((p) => [p.key, p]));
  let total = 0;
  for (const item of items) {
    const product = byKey.get(item.product_key);
    if (!product) continue; // archived product: no current price to estimate with
    total += priceOrderLine(item.quantity, {
      tiers: product.price_tiers,
      basePriceMinor: product.current_unit_price_minor,
    }).line_total_minor;
  }
  return total;
}
