/**
 * The editable rows an open order's edit form starts with. Pure and client-safe.
 *
 * A special price typed on an order is for that order only (it is saved for the
 * customer only when marked "Müşteri için kaydet"), so the order itself is the
 * only record of it. Opening and re-saving an order must therefore keep the
 * prices it was created with, or a one-off price would silently turn into the
 * catalog price the next time the order is edited.
 */
import { priceOrderLine, productLinePricing } from "@/features/products/application/pricing";

import type { Product } from "@/features/products/application/list-products";

export interface StoredOrderLine {
  readonly product_key: string;
  readonly quantity: number;
  readonly unit_price_minor: number;
  readonly line_total_minor: number;
}

export interface EditLineSeed {
  product_key: string;
  quantity: number;
  unit_price_minor?: number;
  save_for_customer?: boolean;
}

export function seedEditLines(
  stored: ReadonlyArray<StoredOrderLine>,
  customerPrices: Readonly<Record<string, number>>,
  productsByKey: ReadonlyMap<string, Product>,
): EditLineSeed[] {
  return stored.map((line): EditLineSeed => {
    const base = { product_key: line.product_key, quantity: line.quantity };
    const saved = customerPrices[line.product_key];
    const product = productsByKey.get(line.product_key);

    // The line was priced with its own flat price when its total is exactly
    // quantity × unit and differs from what the catalog gives today. A tier
    // average (e.g. 3 pkg = ₺350 → ₺116,67) does not reproduce its total, so it
    // is never mistaken for a special price.
    if (product) {
      const auto = priceOrderLine(line.quantity, productLinePricing(product)).line_total_minor;
      const flat = Math.round(line.unit_price_minor * line.quantity) === line.line_total_minor;
      if (flat && line.line_total_minor !== auto) {
        return {
          ...base,
          unit_price_minor: line.unit_price_minor,
          save_for_customer: saved === line.unit_price_minor,
        };
      }
    }

    // Priced from the catalog: a customer who has a saved price is shown it.
    return saved != null
      ? { ...base, unit_price_minor: saved, save_for_customer: true }
      : base;
  });
}
