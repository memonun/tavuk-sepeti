/**
 * Live estimate for the bulk order screen's shared basket. Pure (no I/O) so the
 * arithmetic is testable: the screen only feeds it what is selected.
 *
 * Priced the way the server prices the orders it will create (see
 * bulk-order-pricing.ts): a customer's saved special price is a flat per-unit
 * price and wins over the product's volume tiers.
 */
import { priceOrderLine } from "@/features/products/application/pricing";

import type { DraftBatch } from "@/features/orders/domain/draft-batch";
import type { Product } from "@/features/products/application/list-products";

export interface BasketEstimate {
  /** Sum of the selected customers' lines, delivery fee not included. */
  readonly subtotalMinor: number;
  /** Selected customers who have at least one line — only they become orders. */
  readonly orderCount: number;
  /** Lines that were priced with a customer's special price. */
  readonly specialLineCount: number;
}

export function estimateBasket(
  selectedIds: ReadonlyArray<string>,
  batch: DraftBatch,
  productsByKey: ReadonlyMap<string, Product>,
  priceOverrides: ReadonlyMap<string, Record<string, number>>,
): BasketEstimate {
  let subtotalMinor = 0;
  let orderCount = 0;
  let specialLineCount = 0;

  for (const id of selectedIds) {
    const lines = batch.assignments[id] ?? [];
    if (lines.length > 0) orderCount += 1;
    const overrides = priceOverrides.get(id);
    for (const line of lines) {
      const product = productsByKey.get(line.product_key);
      if (!product) continue;
      const special = overrides?.[line.product_key];
      if (special != null) specialLineCount += 1;
      subtotalMinor += priceOrderLine(line.quantity, {
        tiers: product.price_tiers,
        basePriceMinor: product.current_unit_price_minor,
        overrideUnitPriceMinor: special,
      }).line_total_minor;
    }
  }

  return { subtotalMinor, orderCount, specialLineCount };
}
