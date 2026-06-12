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
 * Reconcile a customer's special prices against the products on an order:
 * a line with an explicit price upserts that special; a line whose special
 * was cleared (no price) deletes any persisted one. Products not on the order
 * are left untouched. Best-effort — failures are swallowed by the repo's
 * logging (the order itself already priced correctly via enrichOrderItems).
 */
export async function reconcileCustomerProductPrices(
  customerId: string,
  lines: ReadonlyArray<{ product_key: string; unit_price_minor?: number | undefined }>,
  opts: { allowDelete?: boolean } = {},
): Promise<void> {
  const persisted = await loadCustomerProductPriceMap(customerId);

  const toUpsert: Array<{ product_key: string; unit_price_minor: number }> = [];
  const toDelete: string[] = [];
  for (const line of lines) {
    if (line.unit_price_minor != null) {
      if (persisted.get(line.product_key) !== line.unit_price_minor) {
        toUpsert.push({ product_key: line.product_key, unit_price_minor: line.unit_price_minor });
      }
    } else if (opts.allowDelete && persisted.has(line.product_key)) {
      // A line whose special was explicitly cleared (edit path only — the
      // create form fetches specials async, so "empty" there isn't reliable).
      toDelete.push(line.product_key);
    }
  }

  if (toUpsert.length > 0) await upsertCustomerProductPrices(customerId, toUpsert);
  if (toDelete.length > 0) await deleteCustomerProductPrices(customerId, toDelete);
}
