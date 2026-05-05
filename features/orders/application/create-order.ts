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
import { orderFormSchema } from "@/features/orders/domain/order.schema";
import { createOrder as repoCreate } from "@/features/orders/infrastructure/order.repository";
import { listActiveProducts } from "@/features/products/application/list-products";
import { logger } from "@/shared/logger";

export type CreateOrderActionState =
  | { status: "idle" }
  | { status: "success"; orderId: string }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | { status: "error"; message: string };

/** True when `quantity` is an integer multiple of `step`. Uses scaled
 *  integer math so 0.5 + 0.5 + ... doesn't drift. 100 = 2 decimal scale. */
function isMultipleOfStep(quantity: number, step: number): boolean {
  const scale = 100;
  return Math.round(quantity * scale) % Math.round(step * scale) === 0;
}

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
  const productByKey = new Map(productsResult.value.map((p) => [p.key, p]));

  const enrichedItems: Array<{
    product_key: string;
    quantity: number;
    unit_price_minor: number;
    product_snapshot: { display_name: string; unit: string; unit_label: string };
  }> = [];

  for (const item of parsed.data.items) {
    const product = productByKey.get(item.product_key);
    if (!product) {
      return {
        status: "validation_error",
        fieldErrors: { items: [`Ürün bulunamadı: ${item.product_key}`] },
      };
    }
    if (item.quantity < product.min_qty) {
      return {
        status: "validation_error",
        fieldErrors: {
          items: [
            `${product.display_name}: minimum ${product.min_qty} ${product.unit_label} gerekli.`,
          ],
        },
      };
    }
    if (!isMultipleOfStep(item.quantity, product.step)) {
      return {
        status: "validation_error",
        fieldErrors: {
          items: [
            `${product.display_name}: miktar ${product.step} ${product.unit_label} katı olmalı.`,
          ],
        },
      };
    }
    enrichedItems.push({
      product_key: item.product_key,
      quantity: item.quantity,
      unit_price_minor: item.unit_price_minor ?? product.current_unit_price_minor,
      product_snapshot: {
        display_name: product.display_name,
        unit: product.unit,
        unit_label: product.unit_label,
      },
    });
  }

  const created = await repoCreate({
    customer_id: parsed.data.customer_id,
    scheduled_for: parsed.data.scheduled_for,
    time_slot: parsed.data.time_slot,
    payment_method: parsed.data.payment_method,
    delivery_notes: parsed.data.delivery_notes,
    delivery_fee_minor: parsed.data.delivery_fee_minor,
    created_by: user.id,
    items: enrichedItems,
  });

  if (!created.ok) {
    logger.error({ code: created.error.code }, "create_order_failed");
    return { status: "error", message: created.error.message };
  }

  revalidatePath("/orders");
  return { status: "success", orderId: created.value.id };
}
