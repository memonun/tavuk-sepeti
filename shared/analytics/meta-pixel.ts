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
 *  - Respects the browser's Global Privacy Control signal. There is NO cookie
 *    consent system in this project yet; when one is added, gate on it in
 *    `canTrack()` below — that is the single place every event passes through.
 *
 * ── Events ─────────────────────────────────────────────────────────────────────
 *  PageView, AddToCart, InitiateCheckout are wired (see their callers).
 *  ViewContent is READY but unused: the storefront has no product detail page.
 *  Purchase is READY but deliberately NOT wired — see `trackPurchase`.
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
// ALLOWLIST, not blocklist. Meta reads the full page URL (query string included)
// off every PageView, and a few routes carry credentials in it: the card-return
// pages (`?no=…&t=<signed return token>`), the password-reset and auth-confirm
// links, guest order lookup. A new sensitive route must never leak by default,
// so only these exact paths report a PageView.
const PAGEVIEW_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/odeme",
  "/duzenli-siparis",
  "/duzenli-siparis-kosullari",
  "/teslimat-kosullari",
  "/islem-rehberi",
]);

export function isPageViewPath(pathname: string): boolean {
  return PAGEVIEW_PATHS.has(pathname);
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
    // (i.e. every client-side navigation) — that bypasses the sensitive-route
    // allowlist above and would report /giris, /odeme/basarili?t=… and friends.
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

function send(event: string, params?: Record<string, unknown>, options?: EventOptions): void {
  try {
    if (!canTrack()) return;
    const fbq = ensureFbq();
    if (!fbq) return;
    const eventOptions = options?.eventId ? { eventID: options.eventId } : undefined;
    if (params && eventOptions) fbq("track", event, params, eventOptions);
    else if (params) fbq("track", event, params);
    else if (eventOptions) fbq("track", event, {}, eventOptions);
    else fbq("track", event);
  } catch {
    // Analytics must never affect the shop.
  }
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

/**
 * Report a page view for `pathname` (call on every client-side route change).
 * Never reports the same path twice in a row — React strict-mode re-runs and
 * re-renders of the tracker are absorbed here. A hidden/sensitive page still
 * counts as "last path", so leaving it for an allowed page reports again.
 */
export function trackPageView(pathname: string): void {
  try {
    if (pathname === lastPageViewPath) return;
    lastPageViewPath = pathname;
    if (!isPageViewPath(pathname)) return;
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

/** READY, NOT CALLED YET: there is no product detail page to attach it to. Call
 *  it once when such a page renders (fire on mount, not on every re-render). */
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
 * NOT WIRED to anything — on purpose. A wrong Purchase is worse than a missing
 * one, and the only trustworthy proof of a card payment is PayTR's HMAC-verified
 * server callback (app/api/paytr/callback → handlePaytrCallback), which never
 * runs in the browser. See the PR notes for the safe integration point.
 *
 * When it IS wired it must be called only from state the SERVER has confirmed as
 * paid, with the amount taken from the server. Guarantees here:
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
  purchasedThisSession.clear();
}
