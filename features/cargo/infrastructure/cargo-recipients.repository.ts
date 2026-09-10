import "server-only";

/**
 * Batched recipient lookup for the cargo prep queue's "Kargo Kartı" — one
 * `IN (…)` query joining `customers` for the whole queue, never one per row
 * (CLAUDE.md §9). Same shape and failure posture as
 * cargo-order-items.repository.ts: reading `orders` / `customers` columns
 * directly here is data coupling via the shared schema, not a cross-feature
 * code import, and a failed lookup degrades to an empty map (the card button
 * just doesn't render) rather than breaking the queue.
 */
import {
  composeCargoRecipient,
  type CargoRecipient,
} from "@/features/cargo/domain/cargo-recipient";
import { logger } from "@/shared/logger";
import { createSupabaseServerClient } from "@/shared/supabase/server";

type EmbeddedCustomer =
  | { first_name?: unknown; last_name?: unknown; phone?: unknown }
  | Array<{ first_name?: unknown; last_name?: unknown; phone?: unknown }>
  | null;

export async function fetchCargoRecipients(
  orderIds: readonly string[],
): Promise<Map<string, CargoRecipient>> {
  const byOrder = new Map<string, CargoRecipient>();
  if (orderIds.length === 0) return byOrder;

  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("orders")
    .select(
      "id, delivery_address_snapshot, customers!inner(first_name, last_name, phone)",
    )
    .in("id", orderIds as string[]);

  if (error) {
    logger.warn({ message: error.message }, "cargo_recipients_lookup_failed");
    return byOrder;
  }

  for (const row of (data ?? []) as Array<{
    id: string;
    delivery_address_snapshot: unknown;
    customers: EmbeddedCustomer;
  }>) {
    // PostgREST returns the embedded to-one as an object, but tolerate an array.
    const customer = Array.isArray(row.customers)
      ? row.customers[0]
      : row.customers;
    byOrder.set(
      row.id,
      composeCargoRecipient({
        orderId: row.id,
        firstName: customer?.first_name,
        lastName: customer?.last_name,
        phone: customer?.phone,
        snapshot: row.delivery_address_snapshot,
      }),
    );
  }

  return byOrder;
}
