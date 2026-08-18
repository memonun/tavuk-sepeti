import { z } from "zod";

/**
 * Customer-facing "request a subscription" input — the storefront's own
 * schema, not a reuse of features/recurring/domain/recurring-template.schema.ts
 * (cross-feature domain imports are an ESLint boundary violation). Mirrors
 * that schema's cadence-shape idea but is deliberately smaller:
 *
 *   - no customer_id / active — the server resolves the caller's own
 *     customer_id and always creates the row inactive (staff approves).
 *   - no day_of_month / monthly cadence — a day-of-month target has no
 *     relationship to which weekdays the van actually drives
 *     (features/storefront/domain/delivery-window.ts), so a customer
 *     self-service request only offers weekly/biweekly with a day_of_week
 *     drawn from the live delivery days.
 *   - no first_run_at — the server always starts from "today + minimum
 *     delivery lead time" (see recurring-order-request.ts), so a stale form
 *     can't submit a past or same-day start.
 */
export const recurringRequestItemSchema = z.object({
  product_key: z.string().min(1),
  quantity: z.coerce.number().positive(),
});

export const recurringRequestSchema = z.object({
  cadence: z.enum(["weekly", "biweekly"]),
  day_of_week: z.coerce.number().int().min(0).max(6),
  items: z.array(recurringRequestItemSchema).min(1, "En az bir ürün gerekli."),
  payment_method: z.enum(["cash_on_delivery", "bank_transfer"]),
});

export type RecurringRequestInput = z.infer<typeof recurringRequestSchema>;
