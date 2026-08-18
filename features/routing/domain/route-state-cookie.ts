/**
 * Transport for "the last route the operator was looking at" across a
 * navigation away from /routes and back — e.g. checking an order in
 * Siparişler, then returning via the sidebar's bare `/routes` link, which
 * carries no query string at all.
 *
 * Deliberately a cookie, not localStorage/React state: /routes is a Server
 * Component that decides what to render from the incoming request, so the
 * restore has to be visible to that FIRST server render (via
 * `cookies()` + a redirect) or the page would flash the wrong view before
 * correcting itself client-side.
 *
 * Only the URL query string is cached — never the computed route itself
 * (stops, and especially Google's `step_polylines`/`overview_polyline`
 * geometry). On restore the page re-runs its normal getDayRoute() call; the
 * existing short-TTL Directions cache (google-directions.ts) answers it for
 * free if still warm, otherwise one fresh call — which is also the only
 * geometry ever persisted longer-term, sidestepping any Google Maps
 * Platform restriction on storing route geometry.
 *
 * Pure (no IO) and parses untrusted input defensively (CLAUDE.md §4) — a
 * cookie is client-writable, so treat its value the same as any other
 * request input.
 */
export const ROUTE_STATE_COOKIE = "route_state";

/** How long a cached route stays restorable before requiring a fresh optimize. */
export const ROUTE_STATE_MAX_AGE_S = 60 * 60;

const MAX_COOKIE_LEN = 2000;

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** The `document.cookie` assignment string for the current active route's query string. */
export function routeStateCookieString(queryString: string): string {
  const value = queryString.slice(0, MAX_COOKIE_LEN);
  return `${ROUTE_STATE_COOKIE}=${encodeURIComponent(value)}; max-age=${ROUTE_STATE_MAX_AGE_S}; path=/routes; SameSite=Lax`;
}

/** The `document.cookie` assignment string that clears the cached route. */
export function clearedRouteStateCookieString(): string {
  return `${ROUTE_STATE_COOKIE}=; max-age=0; path=/routes; SameSite=Lax`;
}

/**
 * The `date` field baked into a cached query string, or null if the cookie
 * is missing, oversized, or doesn't carry a well-formed date — any of which
 * means "don't trust this enough to redirect on it."
 */
export function extractDateFromQueryString(qs: string): string | null {
  if (!qs || qs.length > MAX_COOKIE_LEN) return null;
  const date = new URLSearchParams(qs).get("date");
  return date && isYmd(date) ? date : null;
}
