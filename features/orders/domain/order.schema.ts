/**
 * Order form Zod schema. Single source of truth for the form (UI), the
 * server action (application), and the repository write (infrastructure).
 *
 * Quantity-step validation lives here as a refine — cheese/yogurt sell
 * in 0.5 kg increments, and the form needs to surface the violation
 * inline rather than on submit.
 */
import { z } from "zod";

import { filterRuleListSchema } from "@/shared/filter/filter-rule";

const blankToNull = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? null : value;

const trimmed = (min: number, max: number, message?: string) =>
  z.string().trim().min(min, message).max(max);

/** Per-line product entry. Pricing is automatic from the product's tiers,
 *  unless `unit_price_minor` carries a per-customer special price (the "Özel
 *  fiyat" field). Caller (the form) validates step against the catalog before
 *  submit; the server action re-checks. */
export const orderItemInputSchema = z.object({
  product_key: z.string().min(1),
  quantity: z.coerce.number().positive(),
  /** Optional flat special price (kuruş) for this customer + product. */
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
  // Includes credit_card so an order paid by card on the storefront can be
  // round-tripped through the admin editor. It is deliberately NOT offered in
  // the admin *create* UI (an admin cannot open a PayTR session at the door) —
  // see bulk-order.schema.ts, which stays at two values on purpose.
  payment_method: z.enum(["cash_on_delivery", "bank_transfer", "credit_card"]),
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

/**
 * Edit schema — identical to orderFormSchema but without customer_id.
 * The customer on an existing order is immutable; only fields + line
 * items may change (pending/confirmed orders only).
 */
export const orderEditSchema = orderFormSchema.omit({ customer_id: true });
export type OrderEditInput = z.input<typeof orderEditSchema>;
export type OrderEditParsed = z.output<typeof orderEditSchema>;

/** Cancel reason — a separate schema so the cancel modal can validate
 *  inline before dispatching the transition action. */
export const orderCancelReasonSchema = z.object({
  reason: trimmed(1, 1000, "İptal nedeni gerekli."),
});

export type OrderCancelReason = z.output<typeof orderCancelReasonSchema>;

export const orderSortFieldSchema = z.enum([
  "order_number",
  "status",
  "scheduled_for",
  "payment_status",
  "total_minor",
  "created_at",
]);
export type OrderSortField = z.output<typeof orderSortFieldSchema>;

const statusPatchValue = z.object({
  to: z.enum(["pending", "confirmed", "delivered", "cancelled"]),
  reason: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().max(1000).nullable().default(null),
  ),
});

export const orderCellPatchSchemas = {
  status: statusPatchValue,
  payment_status: z.enum(["pending", "partial", "paid", "failed", "refunded"]),
  scheduled_for: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-MM-DD olmalı."),
  time_slot: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.enum(["morning", "afternoon", "evening"]).nullable(),
  ),
  delivery_notes: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().max(2000).nullable(),
  ),
  delivery_fee: z.coerce.number().int().nonnegative("Negatif olamaz."),
} as const;

export type OrderCellField = keyof typeof orderCellPatchSchemas;

export const orderCellPatchSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("status"), value: orderCellPatchSchemas.status }),
  z.object({ field: z.literal("payment_status"), value: orderCellPatchSchemas.payment_status }),
  z.object({ field: z.literal("scheduled_for"), value: orderCellPatchSchemas.scheduled_for }),
  z.object({ field: z.literal("time_slot"), value: orderCellPatchSchemas.time_slot }),
  z.object({ field: z.literal("delivery_notes"), value: orderCellPatchSchemas.delivery_notes }),
  z.object({ field: z.literal("delivery_fee"), value: orderCellPatchSchemas.delivery_fee }),
]);
export type OrderCellPatch = z.output<typeof orderCellPatchSchema>;

/**
 * Bounded full-load cap for the admin "Excel view" grid — owner-approved §9
 * override (loads the whole table once, up to this cap, then virtualizes).
 * Mirrors customers' GRID_PAGE_SIZE.
 */
export const GRID_PAGE_SIZE = 2000;

export const orderListQuerySchema = z.object({
  status: z.enum(["pending", "confirmed", "delivered", "cancelled"]).optional(),
  fulfillment_channel: z.enum(["delivery", "shipping"]).optional(),
  scheduled_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scheduled_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customer_id: z.string().uuid().optional(),
  /** Free-text search — sipariş no or customer name/phone. See listOrders(). */
  q: z.string().trim().max(100).optional(),
  sort: orderSortFieldSchema.default("scheduled_for"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().positive().default(1),
  // Default 25 for non-grid callers; the grid passes GRID_PAGE_SIZE explicitly.
  pageSize: z.coerce.number().int().positive().max(GRID_PAGE_SIZE).default(25),
  filters: filterRuleListSchema.default([]),
});

export type OrderListQuery = z.output<typeof orderListQuerySchema>;
