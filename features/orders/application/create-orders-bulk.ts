"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/features/auth/application/get-session";
import {
  getCustomerProductPricesBatchAction,
  getCustomersMissingPrimaryAddressAction,
} from "@/features/customers/application/customer-price-actions";
import {
  enrichBulkOrders,
  groupOverridesByCustomer,
} from "@/features/orders/application/bulk-order-pricing";
import { bulkOrderSchema } from "@/features/orders/domain/bulk-order.schema";
import { createOrdersBulk } from "@/features/orders/infrastructure/order.repository";
import { listActiveProducts } from "@/features/products/application/list-products";
import { logAudit } from "@/shared/audit/log-audit";
import { logger } from "@/shared/logger";

export type CreateOrdersBulkState =
  | { status: "idle" }
  | { status: "success"; created: number; orderNumbers: string[] }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | { status: "missing_address"; customerIds: string[] }
  | { status: "error"; message: string };

export async function createOrdersBulkAction(
  _previous: CreateOrdersBulkState,
  formData: FormData,
): Promise<CreateOrdersBulkState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Oturum bulunamadı, tekrar giriş yapın." };
  }

  let batchJson: unknown;
  try {
    const raw = formData.get("batch_json");
    batchJson = typeof raw === "string" ? JSON.parse(raw) : null;
  } catch {
    return { status: "error", message: "Sepet verisi okunamadı." };
  }

  const parsed = bulkOrderSchema.safeParse(batchJson);
  if (!parsed.success) {
    return {
      status: "validation_error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { scheduled_for, time_slot, payment_method, delivery_fee_minor, orders } =
    parsed.data;
  const customerIds = orders.map((o) => o.customer_id);

  // Pre-flight: address-less customers come back as a clean list (no failed tx).
  const missing = await getCustomersMissingPrimaryAddressAction(customerIds);
  if (missing.length > 0) {
    return { status: "missing_address", customerIds: missing };
  }

  // Load catalog once + batch-fetch per-customer overrides (no N+1).
  const productsResult = await listActiveProducts();
  if (!productsResult.ok) {
    return { status: "error", message: productsResult.error.message };
  }
  const overrideRows = await getCustomerProductPricesBatchAction(customerIds);
  const overridesByCustomer = groupOverridesByCustomer(overrideRows);

  const enriched = enrichBulkOrders(orders, productsResult.value, overridesByCustomer);
  if (!enriched.ok) {
    return {
      status: "validation_error",
      fieldErrors: { items: [enriched.error.message] },
    };
  }

  const created = await createOrdersBulk({
    scheduled_for,
    time_slot,
    payment_method,
    delivery_fee_minor,
    created_by: user.id,
    orders: enriched.value.map((o) => ({
      customer_id: o.customer_id,
      delivery_notes: null,
      items: o.items,
    })),
  });

  if (!created.ok) {
    logger.error({ code: created.error.code }, "create_orders_bulk_failed");
    return { status: "error", message: created.error.message };
  }

  await logAudit({
    actor_id: user.id,
    action: "order.bulk_created",
    entity_type: "order",
    entity_id: created.value[0]?.order_id ?? "batch",
    after: {
      scheduled_for,
      count: created.value.length,
      order_numbers: created.value.map((r) => r.order_number),
    },
  });

  revalidatePath("/orders");
  return {
    status: "success",
    created: created.value.length,
    orderNumbers: created.value.map((r) => r.order_number),
  };
}
