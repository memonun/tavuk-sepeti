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
}

export async function fetchDeliveryDetails(
  orderIds: readonly string[],
): Promise<Map<string, DeliveryDetail>> {
  const byId = new Map<string, DeliveryDetail>();
  if (orderIds.length === 0) return byId;

  const supabase = await createSupabaseServerClient();
  const ids = orderIds as string[];

  const [paidRes, itemRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("orders").select("id, amount_paid_minor").in("id", ids),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("order_items")
      .select("order_id, product_key, quantity, line_total_minor, product_snapshot")
      .in("order_id", ids),
  ]);

  if (paidRes.error) {
    logger.warn({ message: paidRes.error.message }, "route_paid_lookup_failed");
  }
  if (itemRes.error) {
    logger.warn({ message: itemRes.error.message }, "route_items_lookup_failed");
  }

  const paidById = new Map<string, number>();
  for (const r of (paidRes.data ?? []) as Array<{
    id: string;
    amount_paid_minor: number | string | null;
  }>) {
    paidById.set(r.id, Number(r.amount_paid_minor ?? 0));
  }

  const itemsByOrder = new Map<string, RouteStopItem[]>();
  for (const r of (itemRes.data ?? []) as Array<{
    order_id: string;
    product_key: string;
    quantity: number | string;
    line_total_minor: number | string | null;
    product_snapshot: unknown;
  }>) {
    const snap = (r.product_snapshot ?? null) as { display_name?: unknown } | null;
    const label =
      snap && typeof snap.display_name === "string"
        ? snap.display_name
        : r.product_key;
    const list = itemsByOrder.get(r.order_id) ?? [];
    list.push({
      label,
      quantity: Number(r.quantity),
      line_total_minor: Number(r.line_total_minor ?? 0),
    });
    itemsByOrder.set(r.order_id, list);
  }

  for (const id of orderIds) {
    byId.set(id, {
      amount_paid_minor: paidById.get(id) ?? 0,
      items: itemsByOrder.get(id) ?? [],
    });
  }
  return byId;
}
