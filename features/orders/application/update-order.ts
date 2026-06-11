"use server";

/**
 * Order edit action — replaces header fields + line items for a
 * pending or confirmed order.
 *
 * Flow:
 *   1. Auth — must be a signed-in admin.
 *   2. Zod-parse the edit payload (orderEditSchema — no customer_id).
 *   3. Fetch the current order to check status + extract frozen prices.
 *   4. Load active products catalog.
 *   5. Enrich + validate line items (frozen prices for existing products,
 *      catalog price for newly added ones).
 *   6. Call the update_order_with_items RPC via the repository.
 *   7. Log audit row.
 *   8. Revalidate /orders + /orders/[id] routes.
 *   9. Return the freshly-fetched Order.
 */
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { enrichOrderItems } from "@/features/orders/application/order-item-pricing";
import { getOrderById } from "@/features/orders/application/get-order";
import { orderEditSchema } from "@/features/orders/domain/order.schema";
import {
  updateOrderWithItems,
} from "@/features/orders/infrastructure/order.repository";
import { listActiveProducts } from "@/features/products/application/list-products";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

import type { Order } from "@/features/orders/domain/order";

export async function updateOrderAction(
  orderId: string,
  raw: unknown,
): Promise<Result<Order, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);
  const user = auth.value;

  const parsed = orderEditSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz form.",
        details: parsed.error.flatten(),
      }),
    );
  }

  // Fetch the current order to verify its status and extract frozen prices.
  const orderResult = await getOrderById(orderId);
  if (!orderResult.ok) return err(orderResult.error);
  const order = orderResult.value;

  if (order.status !== "pending" && order.status !== "confirmed") {
    return err(
      new ValidationError({
        message: "Yalnızca bekleyen veya onaylı siparişler düzenlenebilir.",
      }),
    );
  }

  const productsResult = await listActiveProducts();
  if (!productsResult.ok) return err(productsResult.error);

  // Preserve frozen price + snapshot for products already on the order so
  // re-editing doesn't silently reprice items the customer was quoted on.
  // New product_keys (not in the existing order) get current catalog price.
  const frozen = new Map(
    order.items.map((it) => [
      it.product_key,
      {
        unit_price_minor: it.unit_price_minor,
        product_snapshot: it.product_snapshot,
      },
    ]),
  );

  const enriched = enrichOrderItems(parsed.data.items, productsResult.value, frozen);
  if (!enriched.ok) return err(enriched.error);

  const result = await updateOrderWithItems({
    order_id: orderId,
    scheduled_for: parsed.data.scheduled_for,
    time_slot: parsed.data.time_slot,
    payment_method: parsed.data.payment_method,
    delivery_notes: parsed.data.delivery_notes,
    delivery_fee_minor: parsed.data.delivery_fee_minor,
    items: enriched.value,
  });
  if (!result.ok) return err(result.error);

  await logAudit({
    actor_id: user.id,
    action: "order.updated",
    entity_type: "order",
    entity_id: orderId,
    before: {
      subtotal_minor: order.subtotal_minor,
      items_count: order.items.length,
    },
    after: {
      items_count: enriched.value.length,
    },
    metadata: { source: "order_detail_edit" },
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);

  const fresh = await getOrderById(orderId);
  return fresh.ok ? ok(fresh.value) : err(fresh.error);
}
