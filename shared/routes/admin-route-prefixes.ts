/**
 * The admin panel's top-level URL segments — every routed folder directly under
 * `app/(admin)/`. One list, read by:
 *   - proxy.ts      → an anonymous visitor on any of these is sent to /login
 *   - app/robots.ts → search engines are told not to crawl them
 *
 * A test (admin-route-prefixes.test.ts) reads `app/(admin)/` from disk and
 * fails when a new admin section is added without being listed here, so the
 * proxy and robots.txt can no longer silently drift from the real routes.
 *
 * Pure: no env, no I/O. Safe in the proxy (edge) and in server code.
 */
export const ADMIN_ROUTE_PREFIXES: ReadonlyArray<string> = [
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

/** True for an admin prefix itself or anything below it — not for a path that
 *  merely starts with the same letters (`/ordersx` is not `/orders`). */
export function isAdminPath(pathname: string): boolean {
  return ADMIN_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
