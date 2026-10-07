/**
 * `updateRecurringExpenseTemplateAction` replaces the whole template, so a
 * partial update from the model is overlaid on the stored record first.
 *
 * One subtlety: which day field applies depends on the cadence (weekly →
 * day_of_week, everything else → day_of_month). When the cadence changes, the
 * day field belonging to the OLD cadence must not be inherited — the panel's
 * form clears it too — otherwise "weekly → monthly" would always fail with
 * "haftanın günü girilmez". Values the caller sends explicitly are never
 * rewritten, so a genuinely inconsistent request still gets the action's own
 * validation message.
 */
import type { listRecurringExpenseTemplatesFull } from "@/features/finance/application/list-recurring-expense-templates";

type Current = Extract<
  Awaited<ReturnType<typeof listRecurringExpenseTemplatesFull>>,
  { ok: true }
>["value"][number];

export interface TemplateUpdateFields {
  name?: string | undefined;
  category_id?: string | undefined;
  vendor?: string | null | undefined;
  description?: string | null | undefined;
  amount_type?: "fixed" | "variable" | undefined;
  default_amount_minor?: number | undefined;
  cadence?: "weekly" | "monthly" | "quarterly" | "semiannual" | "yearly" | undefined;
  day_of_week?: number | null | undefined;
  day_of_month?: number | null | undefined;
  start_date?: string | undefined;
  end_date?: string | null | undefined;
  payment_method?: "cash" | "card" | "bank_transfer" | "other" | null | undefined;
  note?: string | null | undefined;
}

export function mergeRecurringTemplate(current: Current, id: string, fields: TemplateUpdateFields) {
  const cadence = fields.cadence ?? current.cadence;
  const weekly = cadence === "weekly";

  return {
    id,
    name: fields.name ?? current.name,
    category_id: fields.category_id ?? current.category_id,
    vendor: fields.vendor !== undefined ? fields.vendor : current.vendor,
    description: fields.description !== undefined ? fields.description : current.description,
    amount_type: fields.amount_type ?? current.amount_type,
    default_amount_minor: fields.default_amount_minor ?? current.default_amount_minor,
    cadence,
    day_of_week: fields.day_of_week !== undefined ? fields.day_of_week : weekly ? current.day_of_week : null,
    day_of_month: fields.day_of_month !== undefined ? fields.day_of_month : weekly ? null : current.day_of_month,
    start_date: fields.start_date ?? current.start_date,
    end_date: fields.end_date !== undefined ? fields.end_date : current.end_date,
    payment_method: fields.payment_method !== undefined ? fields.payment_method : current.payment_method,
    note: fields.note !== undefined ? fields.note : current.note,
  };
}
