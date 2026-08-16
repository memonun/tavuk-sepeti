/**
 * The single canonical production origin — the exact domain PayTR's live
 * merchant credentials are locked to (`https://apuhanciftligi.com`, no
 * `www`). Every place that needs to know this — the www→apex redirect in
 * next.config.ts, and the production sanity check in shared/env.ts —
 * imports it from here instead of re-typing the hostname.
 *
 * Pure: zero env access, zero I/O. Importable both from application code
 * (via the `@/shared/canonical-origin` alias, same as every other shared/
 * module) and from next.config.ts's Node build-time context — Next
 * transpiles next.config.ts with SWC using this repo's tsconfig `paths`,
 * so the `@/` alias resolves there too.
 */
export const CANONICAL_HOSTNAME = "apuhanciftligi.com";
export const CANONICAL_WWW_HOSTNAME = `www.${CANONICAL_HOSTNAME}`;
export const CANONICAL_ORIGIN = `https://${CANONICAL_HOSTNAME}`;

/**
 * True only for the exact origin PayTR's merchant credentials are locked
 * to: `https://apuhanciftligi.com` — https, this hostname, nothing else.
 * Does not special-case localhost or any other value; production-gating
 * is the caller's responsibility (see shared/env.ts).
 */
export function isCanonicalOrigin(appUrl: string): boolean {
  try {
    const url = new URL(appUrl);
    return url.protocol === "https:" && url.hostname === CANONICAL_HOSTNAME;
  } catch {
    return false;
  }
}
