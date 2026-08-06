import "server-only";

/**
 * Enriches route stops with the per-order data the driver needs in hand but
 * that the `find_orders_for_route` RPC doesn't return: how much has been
 * collected (`orders.amount_paid_minor`, trigger-maintained) and the order's
 * line items (`order_items` + frozen `product_snapshot`).
 *
 * Two batched `IN (…)` queries for the whole route — no per-stop round trips.
 * `amount_paid_minor` / `order_items` aren't in the generated Database type on
 * every machine yet, so the Supabase calls are cast; failures degrade to
 * "unpaid / no items" rather than breaking the route.
 */
import { logger } from "@/shared/logger";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { RouteStopItem } from "@/features/routing/domain/route";

export interface DeliveryDetail {
  readonly amount_paid_minor: number;
  readonly items: readonly RouteStopItem[];
  /** Customer-level note (live), from customers.notes. */
  readonly customer_notes: string | null;
  /**
   * Written delivery address, composed from the address row THIS ORDER points at
   * (`orders.address_id` — the same row find_orders_for_route joins for the pin
   * and the legs), so the text the driver reads always matches where the route
   * sends them. NOT the frozen order snapshot, and no longer the customer's
   * current primary address either.
   */
  readonly delivery_address: string | null;
}

function composeAddress(
  rawText: unknown,
  description: unknown,
): string | null {
  const raw = typeof rawText === "string" ? rawText.trim() : "";
  const desc = typeof description === "string" ? description.trim() : "";
  // raw_text already composes the structured address fields; prefix the
  // free-text label/description when present and not already inside it.
  if (raw.length === 0) return desc.length > 0 ? desc : null;
  return desc.length > 0 && !raw.includes(desc) ? `${desc} — ${raw}` : raw;
}

export async function fetchDeliveryDetails(
  orderIds: readonly string[],
): Promise<Map<string, DeliveryDetail>> {
  const byId = new Map<string, DeliveryDetail>();
  if (orderIds.length === 0) return byId;

  const supabase = await createSupabaseServerClient();
  const ids = orderIds as string[];

  const [orderRes, itemRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("orders")
      .select("id, customer_id, address_id, amount_paid_minor, customers(notes)")
      .in("id", ids),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("order_items")
      .select(
        "order_id, product_key, quantity, unit_price_minor, line_total_minor, product_snapshot",
      )
      .in("order_id", ids),
  ]);

  if (orderRes.error) {
    logger.warn({ message: orderRes.error.message }, "route_order_lookup_failed");
  }
  if (itemRes.error) {
    logger.warn({ message: itemRes.error.message }, "route_items_lookup_failed");
  }

  const paidById = new Map<string, number>();
  const notesById = new Map<string, string | null>();
  const addressIdByOrder = new Map<string, string>();
  for (const r of (orderRes.data ?? []) as Array<{
    id: string;
    customer_id: string;
    address_id: string | null;
    amount_paid_minor: number | string | null;
    // PostgREST returns the embedded to-one as an object, but tolerate an array.
    customers: { notes?: unknown } | Array<{ notes?: unknown }> | null;
  }>) {
    paidById.set(r.id, Number(r.amount_paid_minor ?? 0));
    if (r.address_id) addressIdByOrder.set(r.id, r.address_id);
    const customer = Array.isArray(r.customers) ? r.customers[0] : r.customers;
    const notes = customer?.notes;
    notesById.set(r.id, typeof notes === "string" && notes.trim() ? notes : null);
  }

  // The address THIS ORDER was placed to — the same row find_orders_for_route
  // joins for the pin/legs. Previously this looked up the customer's current
  // primary address, which could differ from where the route was actually
  // sending the driver.
  const addressIds = [...new Set(addressIdByOrder.values())];
  const addressById = new Map<string, string | null>();
  if (addressIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addrRes = await (supabase as any)
      .from("addresses")
      .select("id, raw_text, description")
      .in("id", addressIds);
    if (addrRes.error) {
      logger.warn({ message: addrRes.error.message }, "route_address_lookup_failed");
    }
    for (const a of (addrRes.data ?? []) as Array<{
      id: string;
      raw_text: unknown;
      description: unknown;
    }>) {
      addressById.set(a.id, composeAddress(a.raw_text, a.description));
    }
  }

  const itemsByOrder = new Map<string, RouteStopItem[]>();
  for (const r of (itemRes.data ?? []) as Array<{
    order_id: string;
    product_key: string;
    quantity: number | string;
    unit_price_minor: number | string | null;
    line_total_minor: number | string | null;
    product_snapshot: unknown;
  }>) {
    const snap = (r.product_snapshot ?? null) as {
      display_name?: unknown;
      unit_label?: unknown;
    } | null;
    const label =
      snap && typeof snap.display_name === "string"
        ? snap.display_name
        : r.product_key;
    const unitLabel =
      snap && typeof snap.unit_label === "string" ? snap.unit_label : "";
    const list = itemsByOrder.get(r.order_id) ?? [];
    list.push({
      label,
      unit_label: unitLabel,
      quantity: Number(r.quantity),
      unit_price_minor: Number(r.unit_price_minor ?? 0),
      line_total_minor: Number(r.line_total_minor ?? 0),
    });
    itemsByOrder.set(r.order_id, list);
  }

  for (const id of orderIds) {
    const addressId = addressIdByOrder.get(id);
    byId.set(id, {
      amount_paid_minor: paidById.get(id) ?? 0,
      items: itemsByOrder.get(id) ?? [],
      customer_notes: notesById.get(id) ?? null,
      delivery_address: addressId ? (addressById.get(addressId) ?? null) : null,
    });
  }
  return byId;
}
