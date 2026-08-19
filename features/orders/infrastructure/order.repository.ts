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
import { applyFilterRule } from "@/shared/filter/apply-filter-rules";
import { toIstanbulDateString } from "@/shared/utils/date";

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

/**
 * Supabase select projection shared by listOrders and findOrderListItemById.
 * Both functions must return the same column set so rowToListItem can
 * map them identically — keeping it here prevents the two call sites
 * from silently drifting apart.
 */
const ORDER_LIST_SELECT =
  "id, order_number, customer_id, status, scheduled_for, time_slot, total_minor, payment_method, payment_status, amount_paid_minor, delivery_notes, delivery_fee_minor, created_at, source, fulfillment_channel, cargo_carrier, cargo_tracking_number, cargo_tracking_url, recurring_template_id, customers!inner(first_name, last_name)" as const;

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
    line_total_minor: number;
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

// ---- bulk confirm (route dispatch) -----------------------------------------

/**
 * Confirm every still-`pending` order in the given list, in one transaction,
 * via the `confirm_route_orders` RPC. Already-confirmed/delivered/cancelled
 * orders are skipped (idempotent). Returns the ids actually flipped so the
 * caller can audit exactly those.
 *
 * One round-trip for the whole route (≤25 stops today, capped at the app
 * layer) — avoids the N+1 that per-order transitions would fan out into
 * (CLAUDE.md §9). The RPC isn't in the generated Database type yet, mirroring
 * the existing un-generated-RPC cast pattern in this file.
 */
export async function confirmRouteOrders(
  orderIds: ReadonlyArray<string>,
  actorId: string,
): Promise<Result<string[], ExternalApiError>> {
  if (orderIds.length === 0) return ok([]);
  const supabase = await createSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("confirm_route_orders", {
    p_order_ids: [...orderIds],
    p_actor_id: actorId,
  });
  if (error) {
    logger.error(
      { code: error.code, message: error.message },
      "confirm_route_orders_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  const rows = (data ?? []) as Array<{ order_id: string }>;
  return ok(rows.map((r) => r.order_id));
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
const ORDER_FILTERABLE = new Set([
  "order_number",
  "status",
  "payment_status",
  "scheduled_for",
  "time_slot",
  "created_at",
  // Rota / Kargo. Frozen on the row, so filtering it is a plain equality test.
  "fulfillment_channel",
]);

export async function listOrders(
  query: OrderListQuery,
): Promise<Result<ListOrdersResult, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();

  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  // `amount_paid_minor` isn't in the generated types yet (added by the
  // payments migration) — cast so the select string isn't rejected against
  // the stale schema. The rows are mapped explicitly via rowToListItem.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let builder: any = (supabase as any)
    .from("orders")
    .select(ORDER_LIST_SELECT, { count: "exact" });

  if (query.status) {
    builder = builder.eq("status", query.status);
  }
  if (query.fulfillment_channel) {
    builder = builder.eq("fulfillment_channel", query.fulfillment_channel);
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

  // Free-text search: order_number OR the customer's name/phone. The customer
  // side runs as its own lookup (not a joined .or(), which PostgREST cannot
  // reliably mix top-level and embedded-resource conditions in) — same
  // escaping the customer grid's own search uses.
  if (query.q) {
    const escaped = query.q.replace(/[\\%_]/g, (m) => `\\${m}`);
    const pattern = `%${escaped}%`;
    const matchingCustomers = await supabase
      .from("customers")
      .select("id")
      .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},phone.ilike.${pattern}`);
    if (matchingCustomers.error) {
      logger.error(
        { code: matchingCustomers.error.code, message: matchingCustomers.error.message },
        "list_orders_customer_search_failed",
      );
      return err(
        new ExternalApiError({
          message: matchingCustomers.error.message,
          cause: matchingCustomers.error,
        }),
      );
    }
    const customerIds = (matchingCustomers.data ?? []).map((c) => c.id);
    const orConditions = [`order_number.ilike.${pattern}`];
    if (customerIds.length > 0) {
      orConditions.push(`customer_id.in.(${customerIds.join(",")})`);
    }
    builder = builder.or(orConditions.join(","));
  }

  // Advanced filter builder (multi-condition AND). The query schema caps the
  // array at 20 rules and the column whitelist above caps what SQL can touch.
  for (const rule of query.filters) {
    if (!ORDER_FILTERABLE.has(rule.column)) continue;
    builder = applyFilterRule(builder, rule);
  }

  // Apply sort: primary sort is query-driven; secondary tie-breaker on
  // created_at (descending) unless created_at is already the primary sort.
  // order_number sorts by its numeric backbone (order_seq), not the
  // formatted string — the channel letter (R/K) sits before the digits, so
  // string order would group by channel on same-day ties instead of by
  // actual creation order.
  const sortColumn = query.sort === "order_number" ? "order_seq" : query.sort;
  builder = builder.order(sortColumn, { ascending: query.order === "asc" });
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
    items: (data ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (row: any) =>
      rowToListItem({
        id: row.id,
        order_number: row.order_number,
        customer_id: row.customer_id,
        status: row.status,
        scheduled_for: row.scheduled_for,
        time_slot: row.time_slot,
        // Generated column; nullable in supabase-js but always populated.
        total_minor: row.total_minor ?? 0,
        payment_method: row.payment_method,
        payment_status: row.payment_status,
        amount_paid_minor:
          (row as { amount_paid_minor?: number | null }).amount_paid_minor ?? 0,
        delivery_notes: row.delivery_notes,
        delivery_fee_minor: row.delivery_fee_minor ?? 0,
        created_at: row.created_at,
        source: row.source ?? "admin_manual",
        fulfillment_channel: row.fulfillment_channel ?? null,
        cargo_carrier: row.cargo_carrier ?? null,
        cargo_tracking_number: row.cargo_tracking_number ?? null,
        cargo_tracking_url: row.cargo_tracking_url ?? null,
        recurring_template_id: row.recurring_template_id ?? null,
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
    .select(ORDER_LIST_SELECT)
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

// ---- cargo info (carrier / tracking number / tracking url) ------------------

export interface CargoInfoInput {
  order_id: string;
  cargo_carrier: string | null;
  cargo_tracking_number: string | null;
  cargo_tracking_url: string | null;
}

/**
 * Sets the three manual cargo fields. Independent of `status` — does not
 * touch order_status_events; see update-order-cargo-info.ts for why this
 * isn't routed through persistTransition.
 */
export async function updateOrderCargoInfo(
  input: CargoInfoInput,
): Promise<Result<OrderListItem, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: any = {
    cargo_carrier: input.cargo_carrier,
    cargo_tracking_number: input.cargo_tracking_number,
    cargo_tracking_url: input.cargo_tracking_url,
  };
  const { error } = await supabase.from("orders").update(update).eq("id", input.order_id);
  if (error) {
    logger.error(
      { orderId: input.order_id, code: error.code },
      "update_order_cargo_info_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return findOrderListItemById(input.order_id);
}

// ---- update (full order + items) --------------------------------------------

export interface UpdateOrderInput {
  order_id: string;
  scheduled_for: string;
  time_slot: TimeSlot | null;
  payment_method: PaymentMethod;
  delivery_notes: string | null;
  delivery_fee_minor: number;
  items: ReadonlyArray<{
    product_key: string;
    quantity: number;
    unit_price_minor: number;
    line_total_minor: number;
    product_snapshot: {
      display_name: string;
      unit: string;
      unit_label: string;
    };
  }>;
}

/**
 * Calls the `update_order_with_items` RPC — replaces the order header
 * fields and the full items list atomically.
 *
 * The RPC raises P0001 with "cannot be edited" for non-pending/confirmed
 * orders; we surface that as a ValidationError with a clean TR message.
 */
export async function updateOrderWithItems(
  input: UpdateOrderInput,
): Promise<Result<void, ExternalApiError | ValidationError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("update_order_with_items", {
    p_order_id: input.order_id,
    p_scheduled_for: input.scheduled_for,
    p_time_slot: input.time_slot,
    p_payment_method: input.payment_method,
    p_delivery_notes: input.delivery_notes,
    p_delivery_fee_minor: input.delivery_fee_minor,
    p_items: input.items,
  });
  if (error) {
    // P0001 = the RPC's own RAISEs (status guard / empty items).
    if (error.message?.includes("cannot be edited")) {
      return err(
        new ValidationError({
          message: "Yalnızca bekleyen veya onaylı siparişler düzenlenebilir.",
        }),
      );
    }
    logger.error(
      { orderId: input.order_id, code: error.code },
      "update_order_with_items_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}

// ---- delete -----------------------------------------------------------------

export async function deleteOrders(
  ids: ReadonlyArray<string>,
): Promise<Result<{ deleted: number }, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from("orders")
    .delete({ count: "exact" })
    .in("id", [...ids]);
  if (error) {
    logger.error({ code: error.code, n: ids.length }, "delete_orders_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok({ deleted: count ?? ids.length });
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

// ---- bulk create ------------------------------------------------------------

export interface BulkOrderRepoInput {
  scheduled_for: string;
  time_slot: TimeSlot | null;
  payment_method: PaymentMethod;
  delivery_fee_minor: number;
  created_by: string;
  orders: ReadonlyArray<{
    customer_id: string;
    delivery_notes: string | null;
    items: ReadonlyArray<{
      product_key: string;
      quantity: number;
      unit_price_minor: number;
      line_total_minor: number;
      product_snapshot: {
        display_name: string;
        unit: string;
        unit_label: string;
      };
    }>;
  }>;
}

export interface BulkOrderResultRow {
  customer_id: string;
  order_id: string;
  order_number: string;
}

export async function createOrdersBulk(
  input: BulkOrderRepoInput,
): Promise<Result<BulkOrderResultRow[], OrderRepoFailure>> {
  const supabase = await createSupabaseServerClient();

  const p_orders = input.orders.map((o) => ({
    customer_id: o.customer_id,
    scheduled_for: input.scheduled_for,
    time_slot: input.time_slot,
    payment_method: input.payment_method,
    delivery_notes: o.delivery_notes,
    delivery_fee_minor: input.delivery_fee_minor,
    items: o.items,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: rpcError } = await (supabase as any).rpc(
    "create_orders_bulk",
    { p_orders, p_created_by: input.created_by },
  );

  if (rpcError) {
    logger.error(
      { code: rpcError.code, message: rpcError.message, count: p_orders.length },
      "create_orders_bulk_rpc_failed",
    );
    if (rpcError.message?.includes("no primary address")) {
      return err(
        new ValidationError({
          message:
            "Seçili müşterilerden birinin kayıtlı adresi yok; toplu sipariş iptal edildi.",
          cause: rpcError,
        }),
      );
    }
    return err(
      new ExternalApiError({ message: rpcError.message, cause: rpcError }),
    );
  }

  return ok(
    ((data ?? []) as Array<{
      customer_id: string;
      order_id: string;
      order_number: string;
    }>).map((r) => ({
      customer_id: r.customer_id,
      order_id: r.order_id,
      order_number: r.order_number,
    })),
  );
}

// ---- dashboard counts ---------------------------------------------------

/** Orders currently awaiting confirmation. */
export async function countPendingOrders(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) {
    logger.warn({ code: error.code }, "count_pending_orders_failed");
    return 0;
  }
  return count ?? 0;
}

/**
 * Route (hand-delivered, fulfillment_channel="delivery") orders that
 * actually transitioned to "delivered" today (Europe/Istanbul calendar day)
 * — read from order_status_events rather than `orders.status`, since the
 * order row carries no delivered_at and its updated_at also moves on
 * unrelated edits. A two-step query (events first, then orders) avoids
 * relying on PostgREST embedded-resource filter syntax for a dashboard tile.
 */
export async function countTodayHandDeliveries(now: Date = new Date()): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const day = toIstanbulDateString(now);
  const startIso = new Date(`${day}T00:00:00+03:00`).toISOString();
  const endIso = new Date(`${day}T23:59:59.999+03:00`).toISOString();

  const events = await supabase
    .from("order_status_events")
    .select("order_id")
    .eq("to_status", "delivered")
    .gte("created_at", startIso)
    .lte("created_at", endIso);
  if (events.error) {
    logger.warn({ code: events.error.code }, "count_today_hand_deliveries_events_failed");
    return 0;
  }
  const orderIds = [...new Set((events.data ?? []).map((e) => e.order_id))];
  if (orderIds.length === 0) return 0;

  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("fulfillment_channel", "delivery")
    .in("id", orderIds);
  if (error) {
    logger.warn({ code: error.code }, "count_today_hand_deliveries_failed");
    return 0;
  }
  return count ?? 0;
}

/** Cargo (shipping-channel) orders confirmed but not yet handed to the carrier. */
export async function countPendingCargo(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("fulfillment_channel", "shipping")
    .eq("status", "confirmed");
  if (error) {
    logger.warn({ code: error.code }, "count_pending_cargo_failed");
    return 0;
  }
  return count ?? 0;
}
