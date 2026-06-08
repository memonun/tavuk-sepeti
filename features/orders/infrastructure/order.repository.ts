/**
 * Persistence layer for orders.
 *
 * `createOrder` calls the create_order_with_items RPC for atomicity:
 * order + items + initial pending status_event in a single transaction.
 * `persistTransition` uses transition_order_status RPC so the orders
 * UPDATE and the audit-event INSERT can't desync.
 *
 * The state-machine validation runs in the application layer BEFORE
 * persistTransition is called — the RPC is a simple writer.
 */
import "server-only";

import {
  ExternalApiError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import {
  rowToListItem,
  rowToOrder,
  rowToStatusEvent,
} from "@/features/orders/infrastructure/order.mapper";

import type {
  Order,
  OrderListItem,
  OrderStatus,
  OrderStatusEvent,
  PaymentMethod,
  TimeSlot,
} from "@/features/orders/domain/order";
import type { OrderCellField, OrderListQuery } from "@/features/orders/domain/order.schema";
import type { Database } from "@/shared/supabase/types";

type OrderUpdate = Database["public"]["Tables"]["orders"]["Update"];

export interface CreateOrderInput {
  customer_id: string;
  scheduled_for: string;
  time_slot: TimeSlot | null;
  payment_method: PaymentMethod;
  delivery_notes: string | null;
  delivery_fee_minor: number;
  created_by: string;
  items: ReadonlyArray<{
    product_key: string;
    quantity: number;
    unit_price_minor: number;
    product_snapshot: {
      display_name: string;
      unit: string;
      unit_label: string;
    };
  }>;
}

export interface ListOrdersResult {
  items: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export type OrderRepoFailure = ExternalApiError | NotFoundError | ValidationError;

// ---- create ---------------------------------------------------------------

export async function createOrder(
  input: CreateOrderInput,
): Promise<Result<Order, OrderRepoFailure>> {
  const supabase = await createSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orderId, error: rpcError } = await (supabase as any).rpc(
    "create_order_with_items",
    {
      p_customer_id: input.customer_id,
      p_scheduled_for: input.scheduled_for,
      p_time_slot: input.time_slot,
      p_payment_method: input.payment_method,
      p_delivery_notes: input.delivery_notes,
      p_delivery_fee_minor: input.delivery_fee_minor,
      p_created_by: input.created_by,
      p_items: input.items,
    },
  );

  if (rpcError) {
    logger.error(
      { code: rpcError.code, message: rpcError.message },
      "create_order_rpc_failed",
    );
    // Address-less customers are now creatable (blank grid rows), but the
    // RPC RAISEs "customer % has no primary address" since an order needs a
    // delivery target. Surface a clear, actionable Turkish message instead
    // of a generic external-API error.
    if (rpcError.message?.includes("no primary address")) {
      return err(
        new ValidationError({
          message:
            "Bu müşterinin kayıtlı adresi yok. Önce müşteri detayından (harita) bir adres ekleyin.",
          cause: rpcError,
        }),
      );
    }
    return err(
      new ExternalApiError({ message: rpcError.message, cause: rpcError }),
    );
  }

  return findOrderById(String(orderId));
}

// ---- read ----------------------------------------------------------------

export async function findOrderById(
  id: string,
): Promise<Result<Order, OrderRepoFailure>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logger.error({ id, code: error.code }, "find_order_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  if (!data) {
    return err(new NotFoundError({ message: "Sipariş bulunamadı.", details: { id } }));
  }

  return ok(rowToOrder(data));
}

export async function listOrderEvents(
  orderId: string,
): Promise<Result<OrderStatusEvent[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("order_status_events")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (error) {
    logger.error({ orderId, code: error.code }, "list_order_events_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  return ok((data ?? []).map(rowToStatusEvent));
}

/**
 * Whitelist of column ids the advanced filter builder may target for orders.
 * Acts as a second wall behind the Zod parse — prevents tampered URLs from
 * touching unintended columns even if they slip past schema validation.
 * Keep in sync with FILTERABLE_COLUMNS in order-grid.tsx.
 */
const ORDER_FILTERABLE = new Set(["order_number", "status", "payment_status"]);

export async function listOrders(
  query: OrderListQuery,
): Promise<Result<ListOrdersResult, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();

  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  let builder = supabase
    .from("orders")
    .select(
      "id, order_number, customer_id, status, scheduled_for, time_slot, total_minor, payment_status, delivery_notes, delivery_fee_minor, created_at, customers!inner(first_name, last_name)",
      { count: "exact" },
    );

  if (query.status) {
    builder = builder.eq("status", query.status);
  }
  if (query.customer_id) {
    builder = builder.eq("customer_id", query.customer_id);
  }
  if (query.scheduled_from) {
    builder = builder.gte("scheduled_for", query.scheduled_from);
  }
  if (query.scheduled_to) {
    builder = builder.lte("scheduled_for", query.scheduled_to);
  }

  // Advanced filter builder (multi-condition AND). The query schema caps the
  // array at 20 rules and the column whitelist above caps what SQL can touch.
  for (const rule of query.filters) {
    if (!ORDER_FILTERABLE.has(rule.column)) continue;
    const colExpr = rule.column;
    switch (rule.operator) {
      case "contains": {
        if (rule.value === "") break;
        const pat = `%${rule.value.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
        builder = builder.ilike(colExpr, pat);
        break;
      }
      case "equals": {
        if (rule.value === "") break;
        builder = builder.eq(colExpr, rule.value);
        break;
      }
      case "starts_with": {
        if (rule.value === "") break;
        const pat = `${rule.value.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
        builder = builder.ilike(colExpr, pat);
        break;
      }
      case "ends_with": {
        if (rule.value === "") break;
        const pat = `%${rule.value.replace(/[\\%_]/g, (m) => `\\${m}`)}`;
        builder = builder.ilike(colExpr, pat);
        break;
      }
      case "is_empty": {
        // PostgREST OR-clause: NULL or empty-string both count as "empty".
        builder = builder.or(`${colExpr}.is.null,${colExpr}.eq.`);
        break;
      }
      case "is_not_empty": {
        builder = builder.not(colExpr, "is", null).neq(colExpr, "");
        break;
      }
    }
  }

  // Apply sort: primary sort is query-driven; secondary tie-breaker on
  // created_at (descending) unless created_at is already the primary sort.
  builder = builder.order(query.sort, { ascending: query.order === "asc" });
  if (query.sort !== "created_at") {
    builder = builder.order("created_at", { ascending: false });
  }
  builder = builder.range(from, to);

  const { data, error, count } = await builder;
  if (error) {
    logger.error({ code: error.code, message: error.message }, "list_orders_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  return ok({
    items: (data ?? []).map((row) =>
      rowToListItem({
        id: row.id,
        order_number: row.order_number,
        customer_id: row.customer_id,
        status: row.status,
        scheduled_for: row.scheduled_for,
        time_slot: row.time_slot,
        // Generated column; nullable in supabase-js but always populated.
        total_minor: row.total_minor ?? 0,
        payment_status: row.payment_status,
        delivery_notes: row.delivery_notes,
        delivery_fee_minor: row.delivery_fee_minor ?? 0,
        created_at: row.created_at,
        customers: row.customers,
      }),
    ),
    total: count ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  });
}

// ---- transition ---------------------------------------------------------

export interface PersistTransitionInput {
  order_id: string;
  to_status: OrderStatus;
  reason: string | null;
  actor_id: string;
}

export async function persistTransition(
  input: PersistTransitionInput,
): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("transition_order_status", {
    p_order_id: input.order_id,
    p_to_status: input.to_status,
    p_reason: input.reason,
    p_actor_id: input.actor_id,
  });
  if (error) {
    logger.error(
      { code: error.code, message: error.message },
      "persist_transition_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}

// ---- list-item by id --------------------------------------------------------

/** Fetch a single order in the same projection as listOrders. Used after
 *  mutations to return the freshly-updated row without a full aggregate fetch. */
export async function findOrderListItemById(
  id: string,
): Promise<Result<OrderListItem, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, customer_id, status, scheduled_for, time_slot, total_minor, payment_status, delivery_notes, delivery_fee_minor, created_at, customers!inner(first_name, last_name)",
    )
    .eq("id", id)
    .single();
  if (error || !data) {
    return err(
      new ExternalApiError({
        message: error?.message ?? "Sipariş bulunamadı.",
        cause: error,
      }),
    );
  }
  return ok(rowToListItem(data as never));
}

// ---- cell patch (DataGrid inline edit) --------------------------------------

/**
 * Lightweight single-field patcher for the inline-edit grid. Plain fields only
 * — status transitions are handled by persistTransition (state machine).
 * Returns the freshly-projected list-item shape so the grid can replace its
 * optimistic patch without paying for a full Order aggregate fetch.
 *
 * `delivery_fee` maps to the `delivery_fee_minor` column; `total_minor` is a
 * generated column and must never be set directly.
 */
export async function patchOrderCell(
  orderId: string,
  field: Exclude<OrderCellField, "status">,
  value: unknown,
): Promise<Result<OrderListItem, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();

  let update: OrderUpdate;
  switch (field) {
    case "payment_status":
      update = {
        payment_status: value as NonNullable<OrderUpdate["payment_status"]>,
        paid_at: value === "paid" ? new Date().toISOString() : null,
      };
      break;
    case "scheduled_for":
      update = { scheduled_for: value as string };
      break;
    case "time_slot":
      update = { time_slot: value as NonNullable<OrderUpdate["time_slot"]> };
      break;
    case "delivery_notes":
      update = { delivery_notes: value as string | null };
      break;
    case "delivery_fee":
      // total_minor is a generated column — never set it directly.
      update = { delivery_fee_minor: value as number };
      break;
    default: {
      // exhaustive — TypeScript ensures all OrderCellField values (minus
      // "status") are handled above.
      const _exhaustive: never = field;
      return err(
        new ExternalApiError({ message: `Unhandled field: ${String(_exhaustive)}` }),
      );
    }
  }
  const { error } = await supabase.from("orders").update(update).eq("id", orderId);
  if (error) {
    logger.error({ orderId, field, code: error.code }, "patch_order_cell_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return findOrderListItemById(orderId);
}

// ---- aggregate counts -------------------------------------------------------

/**
 * Count how many orders each customer in the provided id list has. Returns a
 * Map keyed by customer_id. Customers with zero orders will be absent from the
 * Map (callers should treat missing keys as 0).
 *
 * Uses the count_orders_by_customers RPC (grouped aggregate) so the count is
 * exact regardless of how many orders exist — no PostgREST max-rows truncation.
 * Falls back to a row-count select if the RPC isn't deployed yet.
 */
export async function countOrdersByCustomer(
  customerIds: ReadonlyArray<string>,
): Promise<Result<Map<string, number>, ExternalApiError>> {
  if (customerIds.length === 0) return ok(new Map());
  const supabase = await createSupabaseServerClient();
  const ids = [...customerIds];

  // Grouped-count RPC: one round-trip, exact counts, no PostgREST max-rows
  // truncation (the old row-per-order select could undercount on large
  // result sets). The RPC isn't in the generated types until the migration
  // is pushed, so we mirror the file's existing un-generated-RPC pattern.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("count_orders_by_customers", {
    p_customer_ids: ids,
  });
  if (!error && data) {
    const counts = new Map<string, number>();
    for (const row of data as Array<{ customer_id: string; order_count: number }>) {
      counts.set(row.customer_id, Number(row.order_count));
    }
    return ok(counts);
  }

  // Fallback (e.g. RPC not yet deployed): count rows directly.
  logger.warn({ code: error?.code }, "count_orders_rpc_unavailable_fallback");
  const fb = await supabase.from("orders").select("customer_id").in("customer_id", ids);
  if (fb.error) return err(new ExternalApiError({ message: fb.error.message, cause: fb.error }));
  const counts = new Map<string, number>();
  for (const row of fb.data ?? []) {
    counts.set(row.customer_id, (counts.get(row.customer_id) ?? 0) + 1);
  }
  return ok(counts);
}
