/**
 * Storefront configuration constants (Faz 2, `/magaza`).
 *
 * Kept in one place so business tweaks — delivery fee, how far out a customer
 * can schedule — are a single-line edit, not a hunt across components. All
 * money is minor units (kuruş), per CLAUDE.md §7.
 */

/**
 * Flat delivery fee applied to every storefront order (kuruş). Launch default
 * is 0 (free delivery). To charge a flat fee, set this; for anything more
 * elaborate (free-over-threshold, distance-based) compute it server-side in
 * `place-order.ts` — never trust the client for money.
 */
export const DELIVERY_FEE_MINOR = 0;

/** Earliest delivery is this many days after "today" (1 = tomorrow). */
export const MIN_DELIVERY_LEAD_DAYS = 1;

/** How far ahead a customer may schedule a delivery (days from today). */
export const MAX_DELIVERY_HORIZON_DAYS = 21;

/** Delivery time-slot options shown at checkout. Values mirror the DB
 *  `time_slot` enum; labels are customer-facing Turkish. */
export const TIME_SLOT_OPTIONS = [
  { value: "morning", label: "Sabah (09:00–12:00)" },
  { value: "afternoon", label: "Öğleden sonra (12:00–17:00)" },
  { value: "evening", label: "Akşam (17:00–20:00)" },
] as const;

/** Payment options shown at checkout. Values mirror the DB `payment_method`
 *  enum. No online payment in Faz 2 (CLAUDE.md §13). */
export const PAYMENT_METHOD_OPTIONS = [
  { value: "cash_on_delivery", label: "Kapıda nakit ödeme" },
  { value: "bank_transfer", label: "Havale / EFT" },
] as const;
