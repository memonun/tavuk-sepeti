/**
 * Order payment ledger — domain types, derived status, and input schema.
 *
 * An order's payment_status is DERIVED from the sum of its payments vs the
 * order total (the DB recompute mirrors `derivePaymentStatus`). Channels are
 * the ways money actually comes in (cash / bank transfer / card). A payment's
 * `paid_at` carries its real date, so "advance" vs "late" is just that date
 * relative to the delivery date.
 */
import { z } from "zod";

export type PaymentChannel = "cash" | "bank_transfer" | "card";

/** The ledger-derived states (subset of the payment_status enum). */
export type PaymentDerivedStatus = "pending" | "partial" | "paid";

export interface OrderPayment {
  readonly id: string;
  readonly order_id: string;
  /** kuruş. Positive = received; negative = refund. */
  readonly amount_minor: number;
  readonly channel: PaymentChannel;
  readonly paid_at: Date;
  readonly note: string | null;
  readonly created_at: Date;
}

/**
 * Derive the payment status from the order total and the amount paid so far.
 * Single source of truth shared with the SQL `recompute_order_payment`.
 */
export function derivePaymentStatus(
  totalMinor: number,
  paidMinor: number,
): PaymentDerivedStatus {
  if (paidMinor <= 0) return "pending";
  if (paidMinor < totalMinor) return "partial";
  return "paid";
}

/**
 * True when an order is a card order whose money never arrived — the customer
 * chose "kart", the order was written, and the PayTR callback either failed or
 * never came (abandoned checkout).
 *
 * Operationally this is NOT the same as a pending cash-on-delivery order: those
 * are pending right up to the doorstep and ride the van normally, whereas an
 * unpaid card order is deliberately held back by find_orders_for_route
 * (20260808120100). The grid uses this to say so instead of showing the same
 * neutral "Bekliyor" for both.
 */
export function isAwaitingCardPayment(order: {
  payment_method: string;
  payment_status: string;
}): boolean {
  return order.payment_method === "credit_card" && order.payment_status !== "paid";
}

const blankToNull = (v: unknown): unknown =>
  typeof v === "string" && v.trim() === "" ? null : v;

export const paymentChannelSchema = z.enum(["cash", "bank_transfer", "card"]);

/** Add-payment input. `paid_at` is an optional ISO string (defaults to now). */
export const addPaymentSchema = z.object({
  order_id: z.string().uuid(),
  amount_minor: z.coerce
    .number()
    .int()
    .refine((n) => n !== 0, "Tutar sıfır olamaz."),
  channel: paymentChannelSchema,
  paid_at: z.string().min(1).optional(),
  note: z.preprocess(blankToNull, z.string().max(500).nullable()).optional(),
});

export type AddPaymentInput = z.input<typeof addPaymentSchema>;
