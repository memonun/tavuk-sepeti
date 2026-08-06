/**
 * Order aggregate domain types — SPEC.md §3.5.
 *
 * Mirrors the DB rows but is Postgres-free. Money is `number` here for
 * convenience (kuruş <= 2^53 in any realistic invoice), the DB stores it
 * as bigint. The mapper layer enforces the bounds.
 */
import type { Coordinate } from "@/shared/geo/coordinate";

export type OrderStatus = "pending" | "confirmed" | "delivered" | "cancelled";
export type TimeSlot = "morning" | "afternoon" | "evening";
/** Mirrors the DB `payment_method` enum. `credit_card` arrives from the
 *  storefront's PayTR flow — it was in the DB enum since 20260728120000 but
 *  missing here, so a card-paid web order read back as an unmodelled value and
 *  the admin panel rendered it as "Havale". */
export type PaymentMethod = "cash_on_delivery" | "bank_transfer" | "credit_card";
export type PaymentStatus =
  | "pending"
  | "partial"
  | "paid"
  | "failed"
  | "refunded";
export type OrderSource =
  | "admin_manual"
  | "customer_web"
  | "recurring_generated";

/**
 * How the order physically reaches the customer. Computed from the order's items
 * at creation and FROZEN on the row (`orders.fulfillment_channel`) — it is not
 * re-derived from `products.fulfillment_type`, so flipping a product later never
 * moves an existing order on or off the route.
 *
 *   delivery — hand-delivered on our own route (Turkish UI label: "Rota")
 *   shipping — sent by cargo, excluded from the route (label: "Kargo")
 *
 * A basket mixing both inside the delivery province is ONE `delivery` order: the
 * cargo-capable goods ride along in the van (owner decision 2026-08-05).
 */
export type FulfillmentChannel = "delivery" | "shipping";

/** Frozen address snapshot — what the customer's address looked like AT
 *  order time. Independent of any later customer.address mutation.
 *
 *  Pre-2026-05-06 orders may be missing the neighborhood / street /
 *  building_no / apartment_no / postal_code keys; the mapper defaults
 *  them to null so reads don't break. */
export interface DeliveryAddressSnapshot {
  readonly raw_text: string;
  readonly description: string | null;
  readonly lat: number;
  readonly lng: number;
  readonly accuracy: Coordinate["accuracy"];
  readonly source: Coordinate["source"];
  readonly city: string | null;
  readonly district: string | null;
  readonly neighborhood: string | null;
  readonly street: string | null;
  readonly building_no: string | null;
  readonly apartment_no: string | null;
  readonly postal_code: string | null;
}

export interface OrderItem {
  readonly id: string;
  readonly order_id: string;
  readonly product_key: string;
  readonly quantity: number;
  /** Frozen price at order time, in kuruş. */
  readonly unit_price_minor: number;
  readonly line_total_minor: number;
  /** Frozen { display_name, unit, unit_label } at order time. */
  readonly product_snapshot: {
    readonly display_name: string;
    readonly unit: string;
    readonly unit_label: string;
  };
  /** Frozen copy of the product's fulfillment type at order time. */
  readonly fulfillment_type: FulfillmentChannel;
}

export interface OrderStatusEvent {
  readonly id: string;
  readonly order_id: string;
  readonly from_status: OrderStatus | null;
  readonly to_status: OrderStatus;
  readonly reason: string | null;
  readonly actor_id: string | null;
  readonly created_at: Date;
}

export interface Order {
  readonly id: string;
  readonly order_number: string;
  readonly customer_id: string;
  readonly status: OrderStatus;

  // Delivery
  /** The address row this order is delivered to. The route joins THIS, not the
   *  customer's current primary address. */
  readonly address_id: string;
  readonly fulfillment_channel: FulfillmentChannel;
  readonly scheduled_for: string; // YYYY-MM-DD (Europe/Istanbul calendar day)
  readonly time_slot: TimeSlot | null;
  readonly delivery_address_snapshot: DeliveryAddressSnapshot;
  readonly delivery_notes: string | null;

  // Items + pricing (kuruş)
  readonly items: readonly OrderItem[];
  readonly subtotal_minor: number;
  readonly delivery_fee_minor: number;
  readonly total_minor: number;
  readonly currency: "TRY";

  // Payment
  readonly payment_method: PaymentMethod;
  readonly payment_status: PaymentStatus;
  /** Sum of recorded payments (kuruş). Balance = total_minor − this. */
  readonly amount_paid_minor: number;
  readonly paid_at: Date | null;

  // Future-proofing
  readonly recurring_template_id: string | null;
  readonly source: OrderSource;

  // Metadata
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly created_by: string | null;
}

/** A list-view projection — drops items + heavy fields for table display. */
export interface OrderListItem {
  readonly id: string;
  readonly order_number: string;
  readonly customer_id: string;
  readonly customer_name: string;
  readonly status: OrderStatus;
  readonly scheduled_for: string;
  readonly time_slot: TimeSlot | null;
  readonly total_minor: number;
  readonly payment_status: PaymentStatus;
  readonly amount_paid_minor: number;
  readonly delivery_notes: string | null;
  readonly delivery_fee_minor: number;
  readonly created_at: Date;
  readonly source: OrderSource;
  readonly fulfillment_channel: FulfillmentChannel;
  readonly recurring_template_id: string | null;
}

/** Turkish labels for the fulfillment channel — the grid, the detail panel and
 *  the filter all read these rather than inlining strings. */
export const FULFILLMENT_CHANNEL_LABELS: Readonly<
  Record<FulfillmentChannel, string>
> = {
  delivery: "Rota",
  shipping: "Kargo",
};
