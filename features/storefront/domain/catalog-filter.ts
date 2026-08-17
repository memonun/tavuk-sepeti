/**
 * Storefront browsing scope: "where is the customer, and which slice of the
 * catalog are they looking at". This is a pure UX/navigation concern — it
 * decides what a customer *sees*, never what an order *becomes*. The real
 * fulfillment decision stays entirely with `fulfillment-channel.ts` and the
 * server; nothing here is read by checkout or order creation.
 *
 * `DeliveryScope` mirrors the two homepage cards ("Malatya'dayım" /
 * "Malatya dışındayım"); `CatalogFilter` is the finer-grained sub-filter shown
 * only inside the Malatya view. Both are carried in the `?teslimat=` /
 * `&filtre=` query params so switching between them is just a link — no
 * client state, no back-button dependency.
 */

export type DeliveryScope = "malatya" | "kargo";

export type CatalogFilter = "tumu" | "ozel" | "kargo";

/** localStorage key the client-side scope-restore effect reads/writes. */
export const DELIVERY_SCOPE_STORAGE_KEY = "ts_teslimat_tercih_v1";

const DELIVERY_SCOPES: readonly DeliveryScope[] = ["malatya", "kargo"];
const CATALOG_FILTERS: readonly CatalogFilter[] = ["tumu", "ozel", "kargo"];

/** `undefined`/anything unrecognized means "no scope chosen yet" — the
 *  homepage then behaves exactly as it always has (show everything). */
export function parseDeliveryScope(
  value: string | undefined,
): DeliveryScope | null {
  return DELIVERY_SCOPES.includes(value as DeliveryScope)
    ? (value as DeliveryScope)
    : null;
}

/** Unrecognized/missing always falls back to "tumu" (no sub-filter applied). */
export function parseCatalogFilter(value: string | undefined): CatalogFilter {
  return CATALOG_FILTERS.includes(value as CatalogFilter)
    ? (value as CatalogFilter)
    : "tumu";
}

/** The slice of a product this module needs — kept minimal (mirrors the
 *  `ChannelItem` pattern in fulfillment-channel.ts) so this file stays pure
 *  and never has to import the `products` feature's `Product` type. */
export interface ScopedProduct {
  readonly fulfillment_type: "delivery" | "shipping";
}

/**
 * The one place the browsing filter rule lives, reused by the page (to filter
 * the grid) and by the controls (to render which option is active).
 *
 * `"kargo"` scope always shows shipping-only, regardless of `filter` — the
 * sub-filter row only exists inside the Malatya view. `"malatya"` scope and no
 * scope at all (`null`, today's default) behave the same: everything, unless
 * narrowed by `filter`.
 */
export function filterProductsForScope<T extends ScopedProduct>(
  products: readonly T[],
  scope: DeliveryScope | null,
  filter: CatalogFilter,
): T[] {
  if (scope === "kargo") {
    return products.filter((p) => p.fulfillment_type === "shipping");
  }
  if (filter === "ozel") {
    return products.filter((p) => p.fulfillment_type === "delivery");
  }
  if (filter === "kargo") {
    return products.filter((p) => p.fulfillment_type === "shipping");
  }
  return [...products];
}
