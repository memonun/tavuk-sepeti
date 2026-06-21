import {
  enrichOrderItems,
  type EnrichedOrderItem,
} from "@/features/orders/application/order-item-pricing";
import type { Product } from "@/features/products/application/list-products";
import { err, ok, type Result } from "@/shared/result";
// Match the ValidationError import path used in order-item-pricing.ts:
import { ValidationError } from "@/shared/errors/app-error";

export interface BulkEnrichedOrder {
  customer_id: string;
  items: EnrichedOrderItem[];
}

export function groupOverridesByCustomer(
  rows: ReadonlyArray<{
    customer_id: string;
    product_key: string;
    unit_price_minor: number;
  }>,
): Map<string, Record<string, number>> {
  const map = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const existing = map.get(row.customer_id) ?? {};
    existing[row.product_key] = row.unit_price_minor;
    map.set(row.customer_id, existing);
  }
  return map;
}

export function enrichBulkOrders(
  orders: ReadonlyArray<{
    customer_id: string;
    items: ReadonlyArray<{ product_key: string; quantity: number }>;
  }>,
  products: ReadonlyArray<Product>,
  overridesByCustomer: ReadonlyMap<string, Record<string, number>>,
): Result<BulkEnrichedOrder[], ValidationError> {
  const out: BulkEnrichedOrder[] = [];

  for (const order of orders) {
    const overrides = overridesByCustomer.get(order.customer_id) ?? {};

    const withPrices = order.items.map((item) => {
      const override = overrides[item.product_key];
      // Omit unit_price_minor entirely when absent (exactOptionalPropertyTypes).
      return override != null
        ? {
            product_key: item.product_key,
            quantity: item.quantity,
            unit_price_minor: override,
          }
        : { product_key: item.product_key, quantity: item.quantity };
    });

    const enriched = enrichOrderItems(withPrices, products);
    if (!enriched.ok) {
      return err(
        new ValidationError({
          message: `${order.customer_id}: ${enriched.error.message}`,
        }),
      );
    }
    out.push({ customer_id: order.customer_id, items: enriched.value });
  }

  return ok(out);
}
