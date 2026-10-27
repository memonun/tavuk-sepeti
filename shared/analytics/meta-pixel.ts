/**
 * Meta Pixel client layer — every `fbq` call in the app goes through here.
 *
 * ── Contract ───────────────────────────────────────────────────────────────────
 *  - No Pixel ID (see meta-pixel-config.ts)  → every function is a silent no-op.
 *    Nothing is installed, no script is requested, no window/document access
 *    happens beyond the cheap enabled check.
 *  - Nothing here can break the app: every function swallows its own errors, and
 *    returns nothing the caller could depend on.
 *  - The Pixel is installed LAZILY, on the first event that is allowed to fire —
 *    not on page load — so a page that never reports anything never loads Meta.
 *  - No personal data is sent: only product ids/names, prices, counts, currency.
 *    Meta's "automatic configuration" (button-click scraping, page microdata and
 *    the automatic advanced matching built on form fields) is switched OFF in
 *    code before `init`. ALSO turn "Automatic advanced matching" off in Meta
 *    Events Manager when the Pixel is created — that is a dashboard setting.
 *  - Never sends from a URL that carries a credential (see `isUrlReportable`):
 *    Meta attaches the full page URL, query and fragment included, to EVERY
 *    event, so this check sits in `send()` and covers all of them.
 *  - Respects the browser's Global Privacy Control signal. There is NO cookie
 *    consent system in this project yet; when one is added, gate on it in
 *    `canTrack()` below — that is the single place every event passes through.
 *
 * ── Events ─────────────────────────────────────────────────────────────────────
 *  Owner decision 2026-10-14: every step of the customer journey is reported.
 *  Standard events (Meta can optimise ads on these):
 *    PageView, ViewContent (product detail page /urun/[slug]),
 *    AddToCart (first add, "+", undo of a removal), InitiateCheckout,
 *    AddPaymentInfo (order submitted with a payment method), Purchase,
 *    CompleteRegistration (account created), Contact (WhatsApp / phone tap),
 *    Lead (recurring-order request).
 *  Custom events (reporting / custom audiences):
 *    RemoveFromCart ("−", "Çıkar", "Sepeti boşalt"), ViewCart (basket opened),
 *    AddShippingInfo (delivery address given), PaymentFailed (card declined),
 *    SelectDeliveryArea (Malatya içi / başka şehir).
 *  Product ids are `products.key` everywhere — the same `g:id` the merchant
 *  feed (/merchant-feed.xml) publishes, so a Meta catalog built from that feed
 *  matches these events.
 *  None of them carries personal data — never an address, name, phone or
 *  e-mail; only product ids, quantities, TRY amounts and fixed labels.
 *  EVERY event carries the page URL (Meta's `dl`), not just PageView — an event
 *  must never be sent from a URL that holds a credential. See `trackPurchase`.
 *
 * ── Conversions API later ──────────────────────────────────────────────────────
 *  Every event accepts an `eventId` and is sent with Meta's `eventID` option, the
 *  deduplication key a future server-side (CAPI) send must reuse. Secrets such as
 *  META_CAPI_ACCESS_TOKEN belong server-side only and must never be NEXT_PUBLIC_.
 */
import { getMetaPixelId } from "@/shared/analytics/meta-pixel-config";

const CURRENCY = "TRY";
const SCRIPT_SRC = "https://connect.facebook.net/en_US/fbevents.js";

// ---- Pages the Pixel may report ----------------------------------------------
//
// Owner decision 2026-10-14: EVERY storefront page reports a PageView — /hesap,
// /giris, /kayit, /siparis-sorgula, the legal pages, the payment result pages,
// 404s. Two things keep that safe:
//   1. The tracker is mounted only by app/(shop)/layout.tsx and the site-wide
//      404 (app/not-found.tsx), so the admin panel (a different layout) never
//      loads the Pixel. The 404 also catches mistyped ADMIN addresses, which is
//      why the admin route group's segments are listed below — a test keeps
//      that list in step with app/(admin)/.
//   2. `isUrlReportable` refuses ANY event — not just PageView — while the URL
//      holds a credential. Path-based allowlisting used to do that job; the URL
//      check does it for every route, including ones added later.
const NEVER_REPORT_PREFIXES: ReadonlyArray<string> = [
  "/auth", // e-mail confirm / recovery landing — a server redirect, carries tokens
  "/api",
  "/login", // admin sign-in
  "/oauth",
  "/.well-known",
  // app/(admin)/* — the admin panel's top-level segments.
  "/admin",
  "/animsaticilar",
  "/customers",
  "/finans",
  "/kargo",
  "/magaza-ayarlari",
  "/map",
  "/orders",
  "/products",
  "/recurring",
  "/reklam",
  "/routes",
  "/takvim",
  "/vitrin",
];

export function isPageViewPath(pathname: string): boolean {
  if (!pathname.startsWith("/")) return false;
  return !NEVER_REPORT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// ---- URLs the Pixel may send from ---------------------------------------------
//
// Query/fragment keys that carry a secret somewhere in this app or its auth
// provider: the card-return token (`t`), Supabase's confirm/recovery/PKCE
// parameters, and the generic names a future feature would reach for.
const CREDENTIAL_PARAMS: ReadonlySet<string> = new Set([
  "t",
  "token",
  "token_hash",
  "code",
  "access_token",
  "refresh_token",
  "provider_token",
  "provider_refresh_token",
  "otp",
  "key",
  "secret",
  "password",
  "signature",
  "sig",
]);

/**
 * Whether the page's current URL may be handed to Meta (which it is, in full,
 * with every event). False when:
 *   - a query parameter is credential-shaped (`CREDENTIAL_PARAMS`, any case);
 *   - the fragment holds key=value pairs at all — this app never uses them,
 *     but Supabase's implicit auth flow puts `#access_token=…` there and a
 *     browser carries a fragment across redirects;
 *   - the URL cannot be read. Unknown is treated as unsafe.
 */
export function isUrlReportable(href: string): boolean {
  try {
    const url = new URL(href);
    if (url.hash.includes("=")) return false;
    for (const key of url.searchParams.keys()) {
      if (CREDENTIAL_PARAMS.has(key.toLowerCase())) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function currentUrlReportable(): boolean {
  try {
    return isUrlReportable(window.location.href);
  } catch {
    return false;
  }
}

// ---- Minimal typing for the global -------------------------------------------

type FbqCall = (...args: unknown[]) => void;
interface FbqStub extends FbqCall {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  loaded: boolean;
  version: string;
  push: FbqStub;
  /** Meta's switch for its own history.pushState PageView detection. */
  disablePushState?: boolean;
  /** Meta ignores repeat PageViews within one page load unless this is set. */
  allowDuplicatePageViews?: boolean;
}
type MetaWindow = Window & { fbq?: FbqStub; _fbq?: FbqStub };

// ---- Gate and installer -------------------------------------------------------

/** Every event passes through here. Add a consent check here when one exists. */
function canTrack(): boolean {
  try {
    if (getMetaPixelId() === null) return false;
    if (typeof window === "undefined" || typeof document === "undefined") return false;
    // Meta reads the full URL off every event: never from one holding a secret.
    if (!currentUrlReportable()) return false;
    // Global Privacy Control: the user asked not to be tracked/sold.
    if ((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Installs Meta's standard `fbq` bootstrap once. Returns the ready function. */
function ensureFbq(): FbqCall | null {
  const pixelId = getMetaPixelId();
  if (pixelId === null) return null;
  const w = window as MetaWindow;

  if (!w.fbq) {
    // Same shape as Meta's official snippet: calls made before fbevents.js has
    // loaded are queued on the stub and replayed by the library.
    const stub = ((...args: unknown[]) => {
      if (stub.callMethod) stub.callMethod(...args);
      else stub.queue.push(args);
    }) as FbqStub;
    stub.push = stub;
    stub.loaded = true;
    stub.version = "2.0";
    stub.queue = [];
    // Meta's library otherwise fires its OWN PageView on every history.pushState
    // (i.e. every client-side navigation) — that bypasses the URL check above
    // and our dedupe, and would report /odeme/basarili?t=… and friends.
    // Turn it off so trackPageView() is the only source of PageViews.
    stub.disablePushState = true;
    // …and since this app is a SPA, each client-side navigation IS a new page
    // view; without this Meta silently drops every PageView after the first.
    // Repeats of the same path are already absorbed by trackPageView().
    stub.allowDuplicatePageViews = true;
    w.fbq = stub;
    if (!w._fbq) w._fbq = stub;

    const script = document.createElement("script");
    script.async = true;
    script.src = SCRIPT_SRC;
    document.head.appendChild(script);

    // Order matters: configuration BEFORE init. autoConfig=false turns off the
    // automatic button-click / microdata collection.
    stub("set", "autoConfig", false, pixelId);
    stub("init", pixelId);
  }
  return w.fbq as FbqCall;
}

interface EventOptions {
  /** Meta `eventID` — the dedupe key shared with a future Conversions API send. */
  eventId?: string | undefined;
}

function send(
  event: string,
  params?: Record<string, unknown>,
  options?: EventOptions,
  /** `trackCustom` for events outside Meta's standard list. */
  method: "track" | "trackCustom" = "track",
): void {
  try {
    if (!canTrack()) return;
    const fbq = ensureFbq();
    if (!fbq) return;
    const eventOptions = options?.eventId ? { eventID: options.eventId } : undefined;
    if (params && eventOptions) fbq(method, event, params, eventOptions);
    else if (params) fbq(method, event, params);
    else if (eventOptions) fbq(method, event, {}, eventOptions);
    else fbq(method, event);
  } catch {
    // Analytics must never affect the shop.
  }
}

function sendCustom(event: string, params: Record<string, unknown>): void {
  send(event, params, undefined, "trackCustom");
}

/**
 * True the first time `key` is seen in this browser tab (sessionStorage),
 * false after. For events that describe a state rather than an action, so a
 * reload or a React re-render cannot repeat them. Blocked storage → true:
 * an occasional duplicate beats losing the event.
 */
function firstTimeThisSession(storageKey: string, key: string): boolean {
  try {
    const seen: unknown = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "[]");
    const list = Array.isArray(seen) ? seen.filter((v): v is string => typeof v === "string") : [];
    if (list.includes(key)) return false;
    window.sessionStorage.setItem(storageKey, JSON.stringify([...list, key].slice(-50)));
    return true;
  } catch {
    return true;
  }
}

function contentParams(contents: ReadonlyArray<MetaContent>): Record<string, unknown> {
  return {
    content_ids: contents.map((c) => c.id),
    contents: contents.map((c) => ({ id: c.id, quantity: c.quantity })),
    content_type: "product",
    num_items: contents.length,
  };
}

/** Kuruş → TRY with two decimals, the unit Meta expects for `value`. */
export function minorToMajor(minor: number): number {
  return Math.round(minor) / 100;
}

/** `<event>:<key>` — build the same string on the server for CAPI dedupe. */
export function metaEventId(event: string, key: string): string {
  return `${event}:${key}`;
}

// ---- PageView -----------------------------------------------------------------

let lastPageViewPath: string | null = null;
/** A PageView held back because the URL carried a credential at the time. */
let deferredPageViewPath: string | null = null;

/**
 * Report a page view for `pathname` (call on every client-side route change).
 * Never reports the same path twice in a row — React strict-mode re-runs and
 * re-renders of the tracker are absorbed here. A page that was not reported
 * still counts as "last path", so leaving it for another page reports again.
 *
 * Arriving on a URL that holds a credential (the card-return page) does not
 * report; the view is held back until the page cleans its URL and calls
 * `flushDeferredPageView`.
 */
export function trackPageView(pathname: string): void {
  try {
    if (pathname === lastPageViewPath) return;
    lastPageViewPath = pathname;
    deferredPageViewPath = null;
    if (!isPageViewPath(pathname)) return;
    if (!currentUrlReportable()) {
      deferredPageViewPath = pathname;
      return;
    }
    send("PageView");
  } catch {
    /* never throw */
  }
}

/**
 * Report the PageView `trackPageView` held back — once, only while still on
 * that page, and only if its URL is now clean. Call right after a page has
 * removed a credential from its own URL.
 */
export function flushDeferredPageView(): void {
  try {
    if (deferredPageViewPath === null || deferredPageViewPath !== lastPageViewPath) return;
    if (!currentUrlReportable()) return;
    deferredPageViewPath = null;
    send("PageView");
  } catch {
    /* never throw */
  }
}

// ---- Shared payload -----------------------------------------------------------

export interface MetaContent {
  /** Stable product id — `products.key`, the same id order_items.product_key uses. */
  readonly id: string;
  readonly quantity: number;
}

// ---- ViewContent --------------------------------------------------------------

export interface ViewContentInput {
  readonly productId: string;
  readonly productName: string;
  readonly valueMinor: number;
  readonly eventId?: string;
}

/** A product detail page was shown. Called once per view on mount, never on
 *  every re-render (features/storefront/ui/meta-product-view-tracker.tsx). */
export function trackViewContent(input: ViewContentInput): void {
  send(
    "ViewContent",
    {
      content_ids: [input.productId],
      content_name: input.productName,
      content_type: "product",
      value: minorToMajor(input.valueMinor),
      currency: CURRENCY,
    },
    { eventId: input.eventId },
  );
}

// ---- AddToCart ----------------------------------------------------------------

export interface AddToCartInput {
  readonly productId: string;
  readonly productName: string;
  readonly quantity: number;
  /** Total for the quantity added (kuruş). */
  readonly valueMinor: number;
  readonly eventId?: string;
}

export function trackAddToCart(input: AddToCartInput): void {
  send(
    "AddToCart",
    {
      content_ids: [input.productId],
      content_name: input.productName,
      content_type: "product",
      contents: [{ id: input.productId, quantity: input.quantity }],
      value: minorToMajor(input.valueMinor),
      currency: CURRENCY,
    },
    { eventId: input.eventId },
  );
}

// ---- InitiateCheckout ---------------------------------------------------------

export interface InitiateCheckoutInput {
  readonly contents: ReadonlyArray<MetaContent>;
  /** Basket subtotal (kuruş), delivery fee excluded — it is not known yet. */
  readonly valueMinor: number;
  readonly eventId?: string;
}

const CHECKOUT_SIGNATURE_KEY = "ts:meta:ic:v1";

/** Same basket → same signature, so reloading /odeme (or React re-running an
 *  effect) does not report a second checkout for an unchanged basket. */
export function checkoutSignature(contents: ReadonlyArray<MetaContent>): string {
  return [...contents]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => `${c.id}x${c.quantity}`)
    .join("|");
}

/**
 * Report that the customer reached checkout with a non-empty basket. Sent once
 * per distinct basket per browser tab (sessionStorage); a changed basket counts
 * as a new checkout. `num_items` is the number of distinct lines — quantities are
 * fractional for kg products, so a sum of them would be meaningless.
 */
export function trackInitiateCheckout(input: InitiateCheckoutInput): void {
  try {
    if (!canTrack() || input.contents.length === 0) return;
    const signature = checkoutSignature(input.contents);
    try {
      if (window.sessionStorage.getItem(CHECKOUT_SIGNATURE_KEY) === signature) return;
      window.sessionStorage.setItem(CHECKOUT_SIGNATURE_KEY, signature);
    } catch {
      // sessionStorage blocked: send anyway rather than lose the event.
    }
    send(
      "InitiateCheckout",
      {
        content_ids: input.contents.map((c) => c.id),
        contents: input.contents.map((c) => ({ id: c.id, quantity: c.quantity })),
        content_type: "product",
        num_items: input.contents.length,
        value: minorToMajor(input.valueMinor),
        currency: CURRENCY,
      },
      { eventId: input.eventId },
    );
  } catch {
    /* never throw */
  }
}

// ---- RemoveFromCart (custom) ----------------------------------------------------

export interface RemoveFromCartInput {
  readonly productId: string;
  readonly productName: string;
  /** How much was taken out (not what is left). */
  readonly quantity: number;
  /** Basket value that left with it (kuruş). */
  readonly valueMinor: number;
}

/** A line was reduced or removed. Mirror image of AddToCart. */
export function trackRemoveFromCart(input: RemoveFromCartInput): void {
  sendCustom("RemoveFromCart", {
    content_ids: [input.productId],
    content_name: input.productName,
    content_type: "product",
    contents: [{ id: input.productId, quantity: input.quantity }],
    value: minorToMajor(input.valueMinor),
    currency: CURRENCY,
  });
}

// ---- ViewCart (custom) ----------------------------------------------------------

export interface BasketInput {
  readonly contents: ReadonlyArray<MetaContent>;
  /** Basket subtotal (kuruş). */
  readonly valueMinor: number;
}

/** The basket panel was opened with something in it. Every opening counts. */
export function trackViewCart(input: BasketInput): void {
  if (input.contents.length === 0) return;
  sendCustom("ViewCart", {
    ...contentParams(input.contents),
    value: minorToMajor(input.valueMinor),
    currency: CURRENCY,
  });
}

// ---- AddShippingInfo (custom) ---------------------------------------------------

export interface ShippingInfoInput extends BasketInput {
  /** How the order would travel — a fixed label, never the address. */
  readonly shippingTier: "eve_teslimat" | "kargo";
  /** Distinguishes one address from another without revealing it (an address
   *  id, or a counter for a guest's re-entries). Dedupe key only — not sent. */
  readonly addressKey: string;
}

const SHIPPING_INFO_KEY = "ts:meta:asi:v1";

/**
 * The customer gave (or picked) a delivery address at checkout. Once per
 * distinct address per basket per tab, so re-renders and reloads of /odeme do
 * not repeat it; a different address or a changed basket reports again.
 * Nothing about the address itself is sent.
 */
export function trackAddShippingInfo(input: ShippingInfoInput): void {
  try {
    if (!canTrack() || input.contents.length === 0) return;
    const key = `${input.addressKey}#${checkoutSignature(input.contents)}`;
    if (!firstTimeThisSession(SHIPPING_INFO_KEY, key)) return;
    sendCustom("AddShippingInfo", {
      ...contentParams(input.contents),
      shipping_tier: input.shippingTier,
      value: minorToMajor(input.valueMinor),
      currency: CURRENCY,
    });
  } catch {
    /* never throw */
  }
}

// ---- AddPaymentInfo -------------------------------------------------------------

export interface PaymentInfoInput extends BasketInput {
  /** The method the order was submitted with (enum value, e.g. "credit_card"). */
  readonly paymentMethod: string;
}

const PAYMENT_INFO_KEY = "ts:meta:api:v1";

/**
 * The order was submitted with a payment method. Once per method per basket
 * per tab — a second press of the button after a validation error is the same
 * attempt, not a new one.
 */
export function trackAddPaymentInfo(input: PaymentInfoInput): void {
  try {
    if (!canTrack() || input.contents.length === 0) return;
    const key = `${input.paymentMethod}#${checkoutSignature(input.contents)}`;
    if (!firstTimeThisSession(PAYMENT_INFO_KEY, key)) return;
    send("AddPaymentInfo", {
      ...contentParams(input.contents),
      payment_type: input.paymentMethod,
      value: minorToMajor(input.valueMinor),
      currency: CURRENCY,
    });
  } catch {
    /* never throw */
  }
}

// ---- CompleteRegistration -------------------------------------------------------

/** A customer account was created. `where` tells signup page from checkout. */
export function trackCompleteRegistration(input: { readonly where: "kayit" | "odeme" }): void {
  send("CompleteRegistration", { content_name: input.where, status: true });
}

// ---- Contact --------------------------------------------------------------------

/** The customer tapped a WhatsApp or phone link. */
export function trackContact(input: { readonly channel: "whatsapp" | "telefon" }): void {
  send("Contact", { content_category: input.channel });
}

/** Which contact channel an href opens, or null when it is not a contact link. */
export function contactChannelOf(href: string): "whatsapp" | "telefon" | null {
  const value = href.trim().toLowerCase();
  if (value.startsWith("tel:")) return "telefon";
  try {
    const host = new URL(value).hostname;
    if (host === "wa.me" || host === "api.whatsapp.com" || host === "whatsapp.com" || host.endsWith(".whatsapp.com")) {
      return "whatsapp";
    }
  } catch {
    // Relative or malformed href: not a contact link.
  }
  return null;
}

// ---- Lead -----------------------------------------------------------------------

/** A recurring-order request was submitted (staff approves it later). */
export function trackLead(input: {
  readonly category: "duzenli_siparis";
  readonly contents: ReadonlyArray<MetaContent>;
}): void {
  send("Lead", { content_category: input.category, ...contentParams(input.contents) });
}

// ---- PaymentFailed (custom) -----------------------------------------------------

const PAYMENT_FAILED_KEY = "ts:meta:pf:v1";

/** PayTR sent the customer back with a failed card payment. Once per order per tab. */
export function trackPaymentFailed(input: { readonly orderId: string | null }): void {
  try {
    if (!canTrack()) return;
    if (!firstTimeThisSession(PAYMENT_FAILED_KEY, input.orderId ?? "?")) return;
    sendCustom("PaymentFailed", { payment_type: "credit_card" });
  } catch {
    /* never throw */
  }
}

// ---- SelectDeliveryArea (custom) ------------------------------------------------

/** The customer picked where they want delivery (the catalogue's one filter). */
export function trackSelectDeliveryArea(input: { readonly area: "malatya" | "kargo" }): void {
  sendCustom("SelectDeliveryArea", { content_category: input.area });
}

// ---- Purchase -----------------------------------------------------------------

export interface PurchaseInput {
  /** The order's stable identifier (order number). The dedupe key. */
  readonly orderId: string;
  readonly contents: ReadonlyArray<MetaContent>;
  /** Amount actually charged, from the SERVER (kuruş). */
  readonly valueMinor: number;
}

const PURCHASED_KEY = "ts:meta:purchased:v1";
const PURCHASED_MAX = 50;
const purchasedThisSession = new Set<string>();

function readPurchased(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(PURCHASED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * A wrong Purchase is worse than a missing one, so this is called only from
 * state the SERVER has confirmed, with the amount taken from the server:
 *   - kapıda ödeme / havale: `placeOrderAction`'s success state — the order is
 *     committed when placed (checkout-form.tsx);
 *   - card: after PayTR's HMAC-verified callback has stamped the order paid
 *     and the return page has read that back (meta-purchase-tracker.tsx). That
 *     page's URL carries the signed return token, which is taken out of the
 *     address bar BEFORE this runs — keep it that way (`send()` refuses while
 *     it is there in any case).
 * Guarantees here:
 *   - at most one Purchase per `orderId` — across re-renders (in-memory set),
 *     refresh, back/forward and re-opening the page (localStorage);
 *   - `eventID` = `purchase:<orderId>`, the key a Conversions API send must reuse.
 * The id is recorded BEFORE sending, so a crash mid-send can only under-report,
 * never double-report.
 */
export function trackPurchase(input: PurchaseInput): void {
  try {
    if (!canTrack() || !input.orderId) return;
    if (purchasedThisSession.has(input.orderId)) return;
    const stored = readPurchased();
    if (stored.includes(input.orderId)) {
      purchasedThisSession.add(input.orderId);
      return;
    }
    purchasedThisSession.add(input.orderId);
    try {
      window.localStorage.setItem(
        PURCHASED_KEY,
        JSON.stringify([...stored, input.orderId].slice(-PURCHASED_MAX)),
      );
    } catch {
      // Storage blocked: the in-memory set still stops re-render duplicates.
    }
    send(
      "Purchase",
      {
        content_ids: input.contents.map((c) => c.id),
        contents: input.contents.map((c) => ({ id: c.id, quantity: c.quantity })),
        content_type: "product",
        num_items: input.contents.length,
        value: minorToMajor(input.valueMinor),
        currency: CURRENCY,
      },
      { eventId: metaEventId("purchase", input.orderId) },
    );
  } catch {
    /* never throw */
  }
}

/** Test seam: forget in-memory state. Not for application code. */
export function __resetMetaPixelForTests(): void {
  lastPageViewPath = null;
  deferredPageViewPath = null;
  purchasedThisSession.clear();
}
