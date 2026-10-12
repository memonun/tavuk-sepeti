/**
 * Takes the signed card-return token out of the address bar — and remembers it.
 *
 * PayTR sends the customer back to `/odeme/basarili?no=…&t=<signed token>`. The
 * token is a credential: it is what lets a GUEST read that order's payment
 * state. Meta's Pixel attaches the full page URL (query string included) to
 * EVERY event it sends, not just PageView — so a `Purchase` reported from that
 * page as-is would hand the token to a third party. It has to be gone from the
 * URL before the Pixel is so much as installed.
 *
 * But the page still needs the token after a reload (phones discard and reload
 * background tabs all the time), or a guest who has just paid is told "Ödemeniz
 * kontrol ediliyor" again. So the token moves from the URL into localStorage,
 * keyed by order number, and `PaymentSuccess` falls back to it.
 *
 * localStorage, not sessionStorage: it must survive the tab being reopened from
 * history. It is no more exposed there than in the browser history it replaces,
 * and it identifies no person — an HMAC over the order number.
 *
 * Every function is a no-op on the server and never throws.
 */

const STORAGE_KEY = "ts:card-return:v1";
/** Enough for anyone's recent orders; bounded so the entry cannot grow forever. */
const MAX_REMEMBERED = 10;

type Remembered = ReadonlyArray<readonly [orderNumber: string, token: string]>;

function read(): Remembered {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): Array<readonly [string, string]> => {
      if (!Array.isArray(entry)) return [];
      const [orderNumber, token]: unknown[] = entry;
      return typeof orderNumber === "string" && typeof token === "string"
        ? [[orderNumber, token]]
        : [];
    });
  } catch {
    return [];
  }
}

/** The token this browser was handed for `orderNumber`, if it still has it. */
export function recallReturnToken(orderNumber: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return read().find(([number]) => number === orderNumber)?.[1] ?? null;
  } catch {
    return null;
  }
}

function remember(orderNumber: string, token: string): boolean {
  try {
    const next = [
      ...read().filter(([number]) => number !== orderNumber),
      [orderNumber, token] as const,
    ].slice(-MAX_REMEMBERED);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Read back: a full or blocked store can accept the call and keep nothing.
    return recallReturnToken(orderNumber) === token;
  } catch {
    return false;
  }
}

/**
 * Move `t` from the current URL into storage. Returns true only when the
 * address bar is verifiably token-free afterwards — the caller must not report
 * anything to a third party otherwise.
 *
 * Refuses (returns false, URL untouched) when the token cannot be stored:
 * stripping it anyway would break the page on reload, and an unreported sale is
 * the cheaper failure.
 */
export function retireReturnTokenFromUrl(orderNumber: string): boolean {
  try {
    if (typeof window === "undefined") return false;
    const url = new URL(window.location.href);
    const token = url.searchParams.get("t");
    if (token === null) return true;
    if (!remember(orderNumber, token)) return false;

    url.searchParams.delete("t");
    // `null`, NOT `history.state`: Next's router patches replaceState, and a
    // state object carrying its own marker makes it skip syncing — the router
    // would keep the old URL as canonical and write the token straight back on
    // its next update. With `null` it copies its state over and adopts the URL.
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    return !new URL(window.location.href).searchParams.has("t");
  } catch {
    return false;
  }
}
