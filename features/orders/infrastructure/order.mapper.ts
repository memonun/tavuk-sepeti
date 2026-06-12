/**
 * Mapper between DB rows and the Order domain entity.
 *
 * The delivery_address_snapshot column is jsonb — we wrote it via the
 * create_order_with_items RPC, so the shape is internal contract. We
 * still validate at the seam: missing fields fall back to safe defaults
 * rather than letting `undefined` leak into the domain.
 */
import type { Database } from "@/shared/supabase/types";
import type { Coordinate } from "@/shared/geo/coordinate";

import type {
  DeliveryAddressSnapshot,
  Order,
  OrderItem,
  OrderListItem,
  OrderStatus,
  OrderStatusEvent,
  PaymentMethod,
  PaymentStatus,
  TimeSlot,
} from "@/features/orders/domain/order";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];
type StatusEventRow = Database["public"]["Tables"]["order_status_events"]["Row"];

interface OrderRowWithItems extends OrderRow {
  order_items: OrderItemRow[];
}

function jsonObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function rowToSnapshot(value: unknown): DeliveryAddressSnapshot {
  const obj = jsonObject(value);
  return {
    raw_text: asString(obj.raw_text) ?? "",
    description: asString(obj.description),
    lat: asNumber(obj.lat) ?? 0,
    lng: asNumber(obj.lng) ?? 0,
    accuracy: (asString(obj.accuracy) as Coordinate["accuracy"]) ?? "unknown",
    source: (asString(obj.source) as Coordinate["source"]) ?? "geocoded_auto",
    city: asString(obj.city),
    district: asString(obj.district),
    // Added 2026-05-06 — pre-existing snapshots default these to null.
    neighborhood: asString(obj.neighborhood),
    street: asString(obj.street),
    building_no: asString(obj.building_no),
    apartment_no: asString(obj.apartment_no),
    postal_code: asString(obj.postal_code),
  };
}

function rowToProductSnapshot(value: unknown): OrderItem["product_snapshot"] {
  const obj = jsonObject(value);
  return {
    display_name: asString(obj.display_name) ?? "",
    unit: asString(obj.unit) ?? "",
    unit_label: asString(obj.unit_label) ?? "",
  };
}

function rowToItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    order_id: row.order_id,
    product_key: row.product_key,
    quantity: Number(row.quantity),
    unit_price_minor: row.unit_price_minor,
    line_total_minor: row.line_total_minor ?? 0,
    product_snapshot: rowToProductSnapshot(row.product_snapshot),
  };
}

export function rowToOrder(row: OrderRowWithItems): Order {
  return {
    id: row.id,
    order_number: row.order_number,
    customer_id: row.customer_id,
    status: row.status as OrderStatus,
    scheduled_for: row.scheduled_for,
    time_slot: (row.time_slot as TimeSlot | null) ?? null,
    delivery_address_snapshot: rowToSnapshot(row.delivery_address_snapshot),
    delivery_notes: row.delivery_notes,
    items: row.order_items.map(rowToItem),
    subtotal_minor: row.subtotal_minor,
    delivery_fee_minor: row.delivery_fee_minor,
    // total_minor is a generated column; supabase-js types it as nullable
    // even though the DB always populates it. Default 0 is unreachable.
    total_minor: row.total_minor ?? 0,
    currency: row.currency as "TRY",
    payment_method: row.payment_method as PaymentMethod,
    payment_status: row.payment_status as PaymentStatus,
    amount_paid_minor:
      (row as { amount_paid_minor?: number | null }).amount_paid_minor ?? 0,
    paid_at: row.paid_at ? new Date(row.paid_at) : null,
    recurring_template_id: row.recurring_template_id,
    source: row.source as Order["source"],
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    created_by: row.created_by,
  };
}

interface ListOrderRow {
  id: string;
  order_number: string;
  customer_id: string;
  status: string;
  scheduled_for: string;
  time_slot: string | null;
  total_minor: number;
  payment_status: string;
  amount_paid_minor: number;
  delivery_notes: string | null;
  delivery_fee_minor: number;
  created_at: string;
  customers: { first_name: string | null; last_name: string | null } | null;
}

export function rowToListItem(row: ListOrderRow): OrderListItem {
  const customer = row.customers;
  const customerName = customer
    ? [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "—"
    : "—";
  return {
    id: row.id,
    order_number: row.order_number,
    customer_id: row.customer_id,
    customer_name: customerName,
    status: row.status as OrderStatus,
    scheduled_for: row.scheduled_for,
    time_slot: row.time_slot as TimeSlot | null,
    total_minor: row.total_minor,
    payment_status: row.payment_status as PaymentStatus,
    amount_paid_minor: row.amount_paid_minor ?? 0,
    delivery_notes: row.delivery_notes,
    delivery_fee_minor: row.delivery_fee_minor,
    created_at: new Date(row.created_at),
  };
}

export function rowToStatusEvent(row: StatusEventRow): OrderStatusEvent {
  return {
    id: row.id,
    order_id: row.order_id,
    from_status: (row.from_status as OrderStatus | null) ?? null,
    to_status: row.to_status as OrderStatus,
    reason: row.reason,
    actor_id: row.actor_id,
    created_at: new Date(row.created_at),
  };
}
