"use server";

/**
 * Order edit action — replaces header fields + line items for a
 * pending, confirmed or delivered order.
 *
 * Flow:
 *   1. Auth — must be a signed-in admin.
 *   2. Zod-parse the edit payload (orderEditSchema — no customer_id).
 *   3. Fetch the current order to check it's still editable.
 *   4. Load active products catalog.
 *   5. Enrich + validate line items at CURRENT pricing (tiers + the customer's
 *      special prices) — no freezing, so preview == saved == stored total.
 *      A delivered order instead keeps each untouched line's charged price
 *      (priceDeliveredOrderEdit) and leaves the customer's specials alone.
 *   6. Call the update_order_with_items RPC via the repository.
 *   7. Log audit row.
 *   8. Revalidate /orders + /orders/[id] routes.
 *   9. Return the freshly-fetched Order.
 */
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import {
  loadCustomerProductPriceMap,
  reconcileCustomerProductPrices,
} from "@/features/customers/application/customer-prices";
import {
  enrichOrderItems,
  priceDeliveredOrderEdit,
} from "@/features/orders/application/order-item-pricing";
import { getOrderById } from "@/features/orders/application/get-order";
import { orderEditSchema } from "@/features/orders/domain/order.schema";
import {
  updateOrderWithItems,
} from "@/features/orders/infrastructure/order.repository";
import { listActiveProducts } from "@/features/products/application/list-products";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

import { isEditableOrderStatus, type Order } from "@/features/orders/domain/order";

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

  // Fetch the current order to verify its status (shipped/cancelled can't be edited).
  const orderResult = await getOrderById(orderId);
  if (!orderResult.ok) return err(orderResult.error);
  const order = orderResult.value;

  if (!isEditableOrderStatus(order.status)) {
    return err(
      new ValidationError({
        message: "Yalnızca bekleyen, onaylı veya teslim edilmiş siparişler düzenlenebilir.",
      }),
    );
  }
  const delivered = order.status === "delivered";

  const productsResult = await listActiveProducts();
  if (!productsResult.ok) return err(productsResult.error);

  // Open orders re-price at current tiers + the customer's special prices, so
  // the editor preview, the saved order, and the totals all agree. A delivered
  // order keeps what was charged on every line the edit leaves alone.
  const enriched = delivered
    ? priceDeliveredOrderEdit(
        parsed.data.items,
        order.items,
        Object.fromEntries(await loadCustomerProductPriceMap(order.customer_id)),
        productsResult.value,
      )
    : enrichOrderItems(parsed.data.items, productsResult.value);
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

  // Persist any per-line special-price changes for this customer. Edit path:
  // a cleared field reliably means "remove this special" (allowDelete).
  // Correcting a delivered order is a fix to a past sale, not a new price for
  // the customer, so it leaves their specials alone.
  if (!delivered) {
    await reconcileCustomerProductPrices(order.customer_id, parsed.data.items, {
      allowDelete: true,
    });
  }

  await logAudit({
    actor_id: user.id,
    action: "order.updated",
    entity_type: "order",
    entity_id: orderId,
    before: {
      subtotal_minor: order.subtotal_minor,
      delivery_fee_minor: order.delivery_fee_minor,
      items_count: order.items.length,
    },
    after: {
      subtotal_minor: enriched.value.reduce((sum, i) => sum + i.line_total_minor, 0),
      delivery_fee_minor: parsed.data.delivery_fee_minor,
      items_count: enriched.value.length,
    },
    metadata: { source: "order_detail_edit", status: order.status },
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);

  const fresh = await getOrderById(orderId);
  return fresh.ok ? ok(fresh.value) : err(fresh.error);
}
