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

import { ExternalApiError, NotFoundError } from "@/shared/errors/app-error";
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
import type { OrderListQuery } from "@/features/orders/domain/order.schema";

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

export type OrderRepoFailure = ExternalApiError | NotFoundError;

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

export async function listOrders(
  query: OrderListQuery,
): Promise<Result<ListOrdersResult, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();

  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  let builder = supabase
    .from("orders")
    .select(
      "id, order_number, customer_id, status, scheduled_for, time_slot, total_minor, payment_status, created_at, customers!inner(first_name, last_name)",
      { count: "exact" },
    )
    .order("scheduled_for", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (query.status) {
    builder = builder.eq("status", query.status);
  }
  if (query.scheduled_from) {
    builder = builder.gte("scheduled_for", query.scheduled_from);
  }
  if (query.scheduled_to) {
    builder = builder.lte("scheduled_for", query.scheduled_to);
  }

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
