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
export type PaymentMethod = "cash_on_delivery" | "bank_transfer";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type OrderSource =
  | "admin_manual"
  | "customer_web"
  | "recurring_generated";

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
  readonly delivery_notes: string | null;
  readonly delivery_fee_minor: number;
  readonly created_at: Date;
}
