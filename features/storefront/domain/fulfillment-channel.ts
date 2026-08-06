/**
 * Which channel a basket becomes, and which address form it therefore needs.
 *
 * Pure and client-safe: the checkout form calls it to pick the address UI, and
 * the Server Action calls it again on re-priced items to decide the channel it
 * sends to the writer. The DB does NOT trust either — `resolve_channel_for_items`
 * re-reads `products.fulfillment_type` inside the insert transaction, so a
 * tampered payload cannot talk its way onto (or off) the delivery route. These
 * functions exist for UX and for a friendly Turkish error, not for security.
 *
 * The rule (owner decision 2026-08-05): a basket with ANY delivery-fulfilled
 * line is one `delivery` order. Inside Malatya the cargo-capable goods simply
 * ride along in the van — no cargo cost, no second order number, and the
 * driver's load list is correct because those goods really are in the van.
 * This is character-for-character the predicate `find_orders_for_route` used to
 * evaluate at query time before the channel was frozen onto the row.
 */

export type FulfillmentChannel = "delivery" | "shipping";

/** The slice of a basket line this module needs. `EnrichedOrderItem` satisfies
 *  it, and so does a catalog `Product` joined to a cart line. */
export interface ChannelItem {
  readonly product_key: string;
  readonly fulfillment_type: FulfillmentChannel;
}

/** True when at least one line must be hand-delivered on our own route. */
export function hasDeliveryItem(items: readonly ChannelItem[]): boolean {
  return items.some((item) => item.fulfillment_type === "delivery");
}

/** The channel this basket becomes. Empty basket → "shipping" (nothing to
 *  deliver); the caller rejects empty baskets before this matters. */
export function resolveOrderChannel(
  items: readonly ChannelItem[],
): FulfillmentChannel {
  return hasDeliveryItem(items) ? "delivery" : "shipping";
}

/**
 * Which address form the customer must fill in.
 *
 * "route" demands street / bina / daire / a confirmed pin — the fields the van
 * needs at the door. "cargo" is the looser courier shape, valid anywhere in
 * Türkiye. Any delivery line pulls the whole basket to "route", which is also
 * what confines fresh products to the delivery province.
 */
export function requiredAddressMode(
  items: readonly ChannelItem[],
): "route" | "cargo" {
  return hasDeliveryItem(items) ? "route" : "cargo";
}
