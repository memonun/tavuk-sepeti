import "server-only";

/**
 * Per-customer special pricing — application surface for the order flow.
 * (Plain server module, NOT a "use server" action file, so it can return a
 * Map and be called by the orders feature across the application boundary.)
 */
import {
  deleteCustomerProductPrices,
  getCustomerProductPrices,
  upsertCustomerProductPrices,
} from "@/features/customers/infrastructure/customer-price.repository";

/** product_key → flat unit price (kuruş) for a customer. Empty on error. */
export async function loadCustomerProductPriceMap(
  customerId: string,
): Promise<Map<string, number>> {
  const res = await getCustomerProductPrices(customerId);
  if (!res.ok) return new Map();
  return new Map(res.value.map((e) => [e.product_key, e.unit_price_minor]));
}

/**
 * Apply the customer's saved ("standing") special prices that an order save asked
 * for. Nothing is saved or removed implicitly: a price typed on an order line is
 * for that order only.
 *   - a line with `save_for_customer` and a price saves it as the customer's price;
 *   - every key in `removeKeys` deletes the saved price (unless the same call
 *     just saved a new one for it).
 * Best-effort — failures are logged by the repository (the order itself already
 * saved and priced correctly via enrichOrderItems).
 */
export async function reconcileCustomerProductPrices(
  customerId: string,
  lines: ReadonlyArray<{
    product_key: string;
    unit_price_minor?: number | undefined;
    save_for_customer?: boolean | undefined;
  }>,
  removeKeys: ReadonlyArray<string> = [],
): Promise<void> {
  const wanted = new Map<string, number>();
  for (const line of lines) {
    if (line.save_for_customer === true && line.unit_price_minor != null) {
      wanted.set(line.product_key, line.unit_price_minor);
    }
  }
  if (wanted.size === 0 && removeKeys.length === 0) return;

  const persisted = await loadCustomerProductPriceMap(customerId);

  const toUpsert: Array<{ product_key: string; unit_price_minor: number }> = [];
  for (const [product_key, unit_price_minor] of wanted) {
    if (persisted.get(product_key) !== unit_price_minor) {
      toUpsert.push({ product_key, unit_price_minor });
    }
  }
  const toDelete = [...new Set(removeKeys)].filter(
    (key) => persisted.has(key) && !wanted.has(key),
  );

  if (toUpsert.length > 0) await upsertCustomerProductPrices(customerId, toUpsert);
  if (toDelete.length > 0) await deleteCustomerProductPrices(customerId, toDelete);
}
