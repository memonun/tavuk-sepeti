"use server";

/**
 * Order create flow:
 *   1. Auth — must be a signed-in admin.
 *   2. Zod-parse the form payload.
 *   3. Load active products to (a) freeze the unit_price + product_snapshot
 *      at order time and (b) validate the per-product quantity-step rule
 *      (cheese/yogurt: 0.5 kg increments, SPEC.md §3.2).
 *   4. Hand to the repo, which calls the create_order_with_items RPC.
 *   5. Revalidate /orders + the new /orders/[id] page.
 */
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/features/auth/application/get-session";
import { enrichOrderItems } from "@/features/orders/application/order-item-pricing";
import { orderFormSchema } from "@/features/orders/domain/order.schema";
import { createOrder as repoCreate } from "@/features/orders/infrastructure/order.repository";
import { listActiveProducts } from "@/features/products/application/list-products";
import { logAudit } from "@/shared/audit/log-audit";
import { logger } from "@/shared/logger";

export type CreateOrderActionState =
  | { status: "idle" }
  | { status: "success"; orderId: string }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | { status: "error"; message: string };

export async function createOrderAction(
  _previous: CreateOrderActionState,
  formData: FormData,
): Promise<CreateOrderActionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Oturum bulunamadı, tekrar giriş yapın." };
  }

  // Items arrive as JSON string from the client (the form serializes the
  // dynamic items array before submit).
  let itemsJson: unknown;
  try {
    const raw = formData.get("items_json");
    itemsJson = typeof raw === "string" ? JSON.parse(raw) : [];
  } catch {
    return { status: "error", message: "Ürün listesi okunamadı." };
  }

  const parsed = orderFormSchema.safeParse({
    customer_id: formData.get("customer_id"),
    scheduled_for: formData.get("scheduled_for"),
    time_slot: formData.get("time_slot"),
    payment_method: formData.get("payment_method"),
    delivery_notes: formData.get("delivery_notes"),
    delivery_fee_minor: formData.get("delivery_fee_minor") ?? 0,
    items: itemsJson,
  });

  if (!parsed.success) {
    return {
      status: "validation_error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  // Load the catalog so we can freeze prices + snapshots and enforce step.
  const productsResult = await listActiveProducts();
  if (!productsResult.ok) {
    return { status: "error", message: productsResult.error.message };
  }

  const enrichedResult = enrichOrderItems(parsed.data.items, productsResult.value);
  if (!enrichedResult.ok) {
    return {
      status: "validation_error",
      fieldErrors: { items: [enrichedResult.error.message] },
    };
  }

  const created = await repoCreate({
    customer_id: parsed.data.customer_id,
    scheduled_for: parsed.data.scheduled_for,
    time_slot: parsed.data.time_slot,
    payment_method: parsed.data.payment_method,
    delivery_notes: parsed.data.delivery_notes,
    delivery_fee_minor: parsed.data.delivery_fee_minor,
    created_by: user.id,
    items: enrichedResult.value,
  });

  if (!created.ok) {
    logger.error({ code: created.error.code }, "create_order_failed");
    return { status: "error", message: created.error.message };
  }

  await logAudit({
    actor_id: user.id,
    action: "order.created",
    entity_type: "order",
    entity_id: created.value.id,
    after: {
      order_number: created.value.order_number,
      customer_id: created.value.customer_id,
      scheduled_for: created.value.scheduled_for,
      total_minor: created.value.total_minor,
      items_count: created.value.items.length,
      payment_method: created.value.payment_method,
    },
  });

  revalidatePath("/orders");
  return { status: "success", orderId: created.value.id };
}
