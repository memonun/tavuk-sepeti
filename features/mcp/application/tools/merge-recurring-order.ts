/**
 * `updateRecurringTemplateAction` validates and replaces the whole template, and
 * its schema DEFAULTS `active` to true. Sending a partial update straight through
 * would therefore silently re-activate a paused template. This overlays the given
 * fields on the stored record and carries `active` over explicitly.
 *
 * Which day field applies depends on the cadence (weekly/biweekly → day_of_week,
 * monthly → day_of_month). When the cadence changes, the day belonging to the OLD
 * cadence is not inherited; explicit values are never rewritten.
 */
import type { getRecurringTemplateAction } from "@/features/recurring/application/recurring-template-actions";

type Current = Extract<
  Awaited<ReturnType<typeof getRecurringTemplateAction>>,
  { ok: true }
>["value"];

export interface RecurringOrderUpdateFields {
  cadence?: "weekly" | "biweekly" | "monthly" | undefined;
  day_of_week?: number | null | undefined;
  day_of_month?: number | null | undefined;
  items?: ReadonlyArray<{ product_key: string; quantity: number }> | undefined;
  payment_method?: "cash_on_delivery" | "bank_transfer" | undefined;
  first_run_at?: string | undefined;
}

export function mergeRecurringOrder(current: Current, fields: RecurringOrderUpdateFields) {
  const cadence = fields.cadence ?? current.cadence;
  const monthly = cadence === "monthly";

  return {
    customer_id: current.customer_id,
    cadence,
    day_of_week:
      fields.day_of_week !== undefined ? fields.day_of_week : monthly ? null : current.day_of_week,
    day_of_month:
      fields.day_of_month !== undefined ? fields.day_of_month : monthly ? current.day_of_month : null,
    items: (fields.items ?? current.items).map((i) => ({ product_key: i.product_key, quantity: i.quantity })),
    payment_method: fields.payment_method ?? current.payment_method,
    active: current.active,
    ...(fields.first_run_at ? { first_run_at: fields.first_run_at } : {}),
  };
}
