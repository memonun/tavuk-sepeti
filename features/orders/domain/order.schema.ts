/**
 * Order form Zod schema. Single source of truth for the form (UI), the
 * server action (application), and the repository write (infrastructure).
 *
 * Quantity-step validation lives here as a refine — cheese/yogurt sell
 * in 0.5 kg increments, and the form needs to surface the violation
 * inline rather than on submit.
 */
import { z } from "zod";

const blankToNull = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? null : value;

const trimmed = (min: number, max: number, message?: string) =>
  z.string().trim().min(min, message).max(max);

/** Per-line product entry. Caller (the form) validates step against the
 *  product catalog before submit; the server action re-checks. */
export const orderItemInputSchema = z.object({
  product_key: z.string().min(1),
  quantity: z.coerce.number().positive(),
  /** Optional unit price override — defaults to product.current_unit_price_minor.
   *  Faz 1 always uses catalog price; the field exists for one-off discounts. */
  unit_price_minor: z.coerce.number().int().nonnegative().optional(),
});

/** Full order create form input. */
export const orderFormSchema = z.object({
  customer_id: z.string().uuid("Müşteri seç."),
  scheduled_for: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-MM-DD formatında olmalı."),
  time_slot: z.preprocess(
    blankToNull,
    z.enum(["morning", "afternoon", "evening"]).nullable(),
  ),
  payment_method: z.enum(["cash_on_delivery", "bank_transfer"]),
  delivery_notes: z.preprocess(
    blankToNull,
    z.string().max(2000).nullable(),
  ),
  delivery_fee_minor: z.coerce.number().int().nonnegative().default(0),
  items: z
    .array(orderItemInputSchema)
    .min(1, "En az bir ürün gerekli."),
});

export type OrderFormInput = z.input<typeof orderFormSchema>;
export type OrderFormParsed = z.output<typeof orderFormSchema>;

/** Cancel reason — a separate schema so the cancel modal can validate
 *  inline before dispatching the transition action. */
export const orderCancelReasonSchema = z.object({
  reason: trimmed(1, 1000, "İptal nedeni gerekli."),
});

export type OrderCancelReason = z.output<typeof orderCancelReasonSchema>;

export const orderListQuerySchema = z.object({
  status: z.enum(["pending", "confirmed", "delivered", "cancelled"]).optional(),
  scheduled_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  scheduled_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export type OrderListQuery = z.output<typeof orderListQuerySchema>;
