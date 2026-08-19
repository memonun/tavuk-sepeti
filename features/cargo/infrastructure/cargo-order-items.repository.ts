/**
 * Batched order_items lookup for the cargo prep list — one `IN (…)` query
 * for the whole queue, not one per order. Same query shape as
 * features/routing/infrastructure/order-delivery-details.ts's
 * fetchDeliveryDetails(), trimmed to just what the manifest needs (no
 * address/customer-notes join, cargo prep doesn't use those). Querying
 * order_items directly here is data coupling via the shared schema, not a
 * cross-feature code import — the same reasoning finance's
 * recent-activity.repository.ts uses for reading order_payments.
 */
import "server-only";

import { logger } from "@/shared/logger";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { CargoManifestItem } from "@/features/cargo/domain/cargo-manifest";

export async function fetchCargoOrderItems(
  orderIds: readonly string[],
): Promise<Map<string, CargoManifestItem[]>> {
  const byOrder = new Map<string, CargoManifestItem[]>();
  if (orderIds.length === 0) return byOrder;

  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("order_items")
    .select("order_id, product_key, quantity, product_snapshot")
    .in("order_id", orderIds as string[]);

  if (error) {
    logger.warn({ message: error.message }, "cargo_order_items_lookup_failed");
    return byOrder;
  }

  for (const row of (data ?? []) as Array<{
    order_id: string;
    product_key: string;
    quantity: number | string;
    product_snapshot: unknown;
  }>) {
    const snap = (row.product_snapshot ?? null) as {
      display_name?: unknown;
      unit_label?: unknown;
    } | null;
    const label =
      snap && typeof snap.display_name === "string" ? snap.display_name : row.product_key;
    const unitLabel = snap && typeof snap.unit_label === "string" ? snap.unit_label : "";

    const list = byOrder.get(row.order_id) ?? [];
    list.push({ label, unit_label: unitLabel, quantity: Number(row.quantity) });
    byOrder.set(row.order_id, list);
  }

  return byOrder;
}
