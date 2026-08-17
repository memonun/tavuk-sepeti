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

/**
 * Where the address map opens before the customer has chosen anything — the
 * centre of the delivery province. A neutral starting view, not a suggestion:
 * no pin is placed here, the customer still taps their own spot. A cargo
 * customer elsewhere in Türkiye simply pans away, which is cheaper than making
 * everyone start from a world view.
 */
export const DELIVERY_PROVINCE_CENTER = { lat: 38.3552, lng: 38.3095 } as const;

/** Short per-product badge shown on delivery-only (non-cargoable) items. */
export const DELIVERY_ONLY_BADGE = `Yalnızca ${DELIVERY_PROVINCE}'da teslim`;

/** Short per-product badge shown on cargo (nationwide shipping) items —
 *  the symmetric counterpart to DELIVERY_ONLY_BADGE. */
export const SHIPPING_BADGE = "Kargo ile Türkiye'nin Her Yerine";

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

/**
 * Payment options shown at checkout. Values mirror the DB `payment_method`
 * enum.
 *
 * `channels` is the owner's rule, not a UI preference: cash on delivery means
 * our own driver takes the money at the door, so it exists ONLY on a home
 * delivery. A cargo parcel is handed to a courier who collects nothing on our
 * behalf, and an unpaid box that ships across Türkiye is a loss we cannot
 * recover — so an out-of-city order is prepaid (card or havale) or it is not
 * placed. `paymentMethodsForChannel` in domain/payment-options.ts is the one
 * place that reads this, and the Server Action re-checks it server-side.
 */
export const PAYMENT_METHOD_OPTIONS = [
  {
    value: "credit_card",
    label: "Kredi / Banka Kartı (Güvenli Ödeme)",
    channels: ["delivery", "shipping"],
  },
  {
    value: "cash_on_delivery",
    label: "Kapıda nakit ödeme",
    channels: ["delivery"],
  },
  {
    value: "bank_transfer",
    label: "Havale / EFT",
    channels: ["delivery", "shipping"],
  },
] as const;

/** Shown wherever a cargo basket is priced — the owner asked that free
 *  shipping be stated, not merely implied by a ₺0,00 line. */
export const CARGO_FREE_SHIPPING_NOTICE =
  "Kargolu siparişlerde kargo ücretsizdir.";
