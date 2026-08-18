/**
 * Mapper between recurring_templates DB rows and the domain entities.
 *
 * The `items` column is jsonb — we defensively parse each element so that
 * a malformed stored entry cannot leak `undefined` into the domain. The
 * table is not in the generated TS types (added via migration after the
 * types were last generated) so all rows arrive as `unknown` / `any`-casted.
 *
 * Mirrors features/orders/infrastructure/order.mapper.ts style.
 */

import type {
  RecurringCadence,
  RecurringPaymentMethod,
  RecurringTemplate,
  RecurringTemplateItem,
  RecurringTemplateListItem,
  RecurringTemplateSource,
} from "@/features/recurring/domain/recurring-template";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

function asBoolean(v: unknown): boolean {
  return typeof v === "boolean" ? v : Boolean(v);
}

function parseItems(raw: unknown): RecurringTemplateItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((el: unknown) => {
    if (typeof el !== "object" || el === null) return [];
    const obj = el as Record<string, unknown>;
    const product_key = asString(obj["product_key"]);
    const quantity = asNumber(obj["quantity"]);
    if (product_key == null || quantity == null) return [];
    return [{ product_key, quantity } satisfies RecurringTemplateItem];
  });
}

// ---------------------------------------------------------------------------
// Public mappers
// ---------------------------------------------------------------------------

/** Full domain entity — used after insert / update / findById. */
export function rowToRecurringTemplate(row: Record<string, unknown>): RecurringTemplate {
  return {
    id: asString(row["id"]) ?? "",
    customer_id: asString(row["customer_id"]) ?? "",
    cadence: (asString(row["cadence"]) ?? "weekly") as RecurringCadence,
    day_of_week: asNumber(row["day_of_week"]),
    day_of_month: asNumber(row["day_of_month"]),
    items: parseItems(row["items"]),
    payment_method: (asString(row["payment_method"]) ?? "cash_on_delivery") as RecurringPaymentMethod,
    active: asBoolean(row["active"]),
    next_run_at: new Date(asString(row["next_run_at"]) ?? 0),
    source: (asString(row["source"]) ?? "admin_manual") as RecurringTemplateSource,
    approved_at: asString(row["approved_at"]) != null ? new Date(asString(row["approved_at"]) ?? 0) : null,
    created_at: new Date(asString(row["created_at"]) ?? 0),
    updated_at: new Date(asString(row["updated_at"]) ?? 0),
  };
}

interface ListRow extends Record<string, unknown> {
  customers: { first_name: string | null; last_name: string | null } | null;
}

/** Compact list projection — used by listTemplatesByCustomer. */
export function rowToListItem(row: ListRow): RecurringTemplateListItem {
  const c = row.customers;
  const customer_name =
    c != null
      ? [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "(isimsiz)"
      : "(isimsiz)";

  return {
    id: asString(row["id"]) ?? "",
    customer_id: asString(row["customer_id"]) ?? "",
    customer_name,
    cadence: (asString(row["cadence"]) ?? "weekly") as RecurringCadence,
    day_of_week: asNumber(row["day_of_week"]),
    day_of_month: asNumber(row["day_of_month"]),
    item_count: parseItems(row["items"]).length,
    payment_method: (asString(row["payment_method"]) ?? "cash_on_delivery") as RecurringPaymentMethod,
    active: asBoolean(row["active"]),
    next_run_at: new Date(asString(row["next_run_at"]) ?? 0),
    source: (asString(row["source"]) ?? "admin_manual") as RecurringTemplateSource,
    approved_at: asString(row["approved_at"]) != null ? new Date(asString(row["approved_at"]) ?? 0) : null,
  };
}
