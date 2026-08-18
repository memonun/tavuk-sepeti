/**
 * Recurring order template — the persistent "set once" subscription intent for
 * one customer. A scheduled delivery is materialized into a real `orders` row
 * lazily (when the route for its due day is opened); the template itself is
 * never an order. Postgres-free domain type (mirrors order.ts style).
 *
 * Cadence shape invariant (enforced in DB CHECK + the Zod schema):
 *   weekly | biweekly → day_of_week set (0=Sun..6=Sat), day_of_month null
 *   monthly           → day_of_month set (1..31), day_of_week null
 */
export type RecurringCadence = "weekly" | "biweekly" | "monthly";

/** Mirrors orders' PaymentMethod, kept local to avoid a cross-feature domain
 *  dependency (ESLint boundaries: cross-feature imports go via application/). */
export type RecurringPaymentMethod = "cash_on_delivery" | "bank_transfer";

/** Mirrors customers' origin enum — who created this template. */
export type RecurringTemplateSource = "admin_manual" | "customer_web" | "customer_guest";

export interface RecurringTemplateItem {
  readonly product_key: string;
  readonly quantity: number;
}

export interface RecurringTemplate {
  readonly id: string;
  readonly customer_id: string;
  readonly cadence: RecurringCadence;
  /** 0=Sunday..6=Saturday; set iff weekly/biweekly. */
  readonly day_of_week: number | null;
  /** 1..31; set iff monthly. */
  readonly day_of_month: number | null;
  readonly items: readonly RecurringTemplateItem[];
  readonly payment_method: RecurringPaymentMethod;
  readonly active: boolean;
  readonly next_run_at: Date;
  readonly source: RecurringTemplateSource;
  /** First time a customer_web request was switched active. Null = still
   *  pending staff review — distinct from `active` so a later pause doesn't
   *  make an already-approved row look like a fresh request again. */
  readonly approved_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/** Compact projection for the customer panel + the global overview list. */
export interface RecurringTemplateListItem {
  readonly id: string;
  readonly customer_id: string;
  readonly customer_name: string;
  readonly cadence: RecurringCadence;
  readonly day_of_week: number | null;
  readonly day_of_month: number | null;
  readonly item_count: number;
  readonly payment_method: RecurringPaymentMethod;
  readonly active: boolean;
  readonly next_run_at: Date;
  readonly source: RecurringTemplateSource;
  readonly approved_at: Date | null;
}
