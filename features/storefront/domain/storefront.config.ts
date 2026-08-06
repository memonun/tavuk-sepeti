/**
 * Storefront configuration constants (Faz 2, `/`).
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

/**
 * Flat fee on a CARGO order (kuruş). Separate from DELIVERY_FEE_MINOR on
 * purpose: shipping a parcel nationwide and driving a van across Malatya are
 * different costs, and conflating them would force one to change when the other
 * does. Launch default is 0 (free shipping).
 */
export const CARGO_FEE_MINOR = 0;

/**
 * Province where delivery-only (non-cargoable) products are hand-delivered on
 * our own route. Products with fulfillment_type "shipping" go anywhere by cargo;
 * "delivery" products (fresh dairy, eggs) are restricted to this province.
 */
export const DELIVERY_PROVINCE = "Malatya";

/** Short per-product badge shown on delivery-only (non-cargoable) items. */
export const DELIVERY_ONLY_BADGE = `Yalnızca ${DELIVERY_PROVINCE}'da teslim`;

/** Full customer-facing notice (home page + checkout). */
export const FULFILLMENT_NOTICE = `Taze ürünlerimiz (süt ürünleri ve yumurta gibi kargoya verilemeyen ürünler) yalnızca ${DELIVERY_PROVINCE} il sınırları içinde teslim edilir. Kargoyla gönderilebilen ürünler Türkiye'nin her yerine gönderilir.`;

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
  { value: "credit_card", label: "Kredi / Banka Kartı (Güvenli Ödeme)" },
  { value: "cash_on_delivery", label: "Kapıda nakit ödeme" },
  { value: "bank_transfer", label: "Havale / EFT" },
] as const;
