import { NextResponse, type NextRequest } from "next/server";

import { refreshSupabaseSession } from "@/shared/supabase/session";

const LOGIN_PATH = "/login";
const ADMIN_HOME = "/admin";

// Admin-only route prefixes. Everything else — the public storefront at `/` and
// its sub-pages (/giris, /kayit, /hesap, /odeme, /auth/*, …) — is open to
// anonymous visitors. Keep this list in sync with the admin nav (admin-sidebar).
const ADMIN_PREFIXES = [
  "/admin",
  "/orders",
  "/customers",
  "/products",
  "/map",
  "/routes",
  "/recurring",
];

function isAdminPath(pathname: string): boolean {
  return ADMIN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Carry any session cookies `refreshSupabaseSession` just rotated onto a
 * response we are returning INSTEAD of its own.
 *
 * Supabase rotates the refresh token on every refresh: the moment the new one
 * is issued, the old one is dead. Returning a bare redirect here dropped the
 * new pair on the floor, so the browser kept presenting the dead token and the
 * next request failed with `refresh_token_not_found` — the customer is silently
 * signed out and has to log in again. Refreshing is only safe if the result
 * reaches the browser on the SAME response.
 */
function withRefreshedCookies(
  target: NextResponse,
  source: NextResponse,
): NextResponse {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  return target;
}

/**
 * Next 16 proxy (formerly `middleware`).
 *
 * The public storefront owns the root; the admin dashboard lives under /admin
 * (plus the legacy CRM routes /orders, /customers, …). So gating is inverted
 * from Faz 1: only ADMIN paths require a session — the shop is always public.
 *   - Unauthenticated → an admin path → redirect to /login.
 *   - Authenticated → /login          → redirect to /admin.
 * A logged-in non-admin (customer) who reaches an admin path passes here but is
 * bounced to the storefront by the admin layout's is_admin() check.
 *
 * The matcher excludes static assets so we don't pay for cookie refresh on
 * every image or chunk.
 */
export async function proxy(request: NextRequest) {
  const { response, userId } = await refreshSupabaseSession(request);
  const pathname = request.nextUrl.pathname;

  if (!userId && isAdminPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    return withRefreshedCookies(NextResponse.redirect(url), response);
  }

  if (userId && pathname === LOGIN_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = ADMIN_HOME;
    return withRefreshedCookies(NextResponse.redirect(url), response);
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except: Next internals, API auth callbacks, and
    // common static asset extensions. Keep this list tight — broader
    // matchers slow every request.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
