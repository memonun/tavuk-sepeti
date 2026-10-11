/**
 * Shared by `HomeHero` (Server Component, builds the inline script) and
 * `HomeHeroIntroMarker` (Client Component, writes them). Kept in a plain
 * module on purpose: a constant exported from a "use client" file reaches a
 * Server Component as a client reference, not as its string value.
 */

/** sessionStorage, not localStorage: "once per visit", and it plays again the
 *  next time the customer opens the shop. */
export const HOME_INTRO_STORAGE_KEY = "ts_acilis_goruldu_v1";

/** Set on <html>; theme.css keys the entrance off its absence. */
export const HOME_INTRO_SEEN_ATTR = "data-shop-intro-seen";

/**
 * Inline script for the shop layout. It runs while the document is still
 * being parsed — before anything below it is painted — and marks the root if
 * this browser session has already seen the opening, so theme.css skips the
 * entrance. It has to be inline and early: a React effect runs after the
 * first paint, and the picture would flash in and then fade in again.
 *
 * It lives in the LAYOUT, not next to the picture: a layout is rendered once
 * on the server and kept across client navigations, whereas a <script> inside
 * the page would be re-created on the client (where React never executes it
 * and warns about it).
 *
 * Reading sessionStorage can throw (blocked site data, some private modes).
 * The only consequence is that the half-second entrance plays again, so the
 * failure is deliberately ignored; there is nothing to recover and no logger
 * this early in the page.
 */
export const HOME_INTRO_SKIP_SCRIPT = `try{if(sessionStorage.getItem(${JSON.stringify(
  HOME_INTRO_STORAGE_KEY,
)}))document.documentElement.setAttribute(${JSON.stringify(HOME_INTRO_SEEN_ATTR)},"")}catch(e){}`;
