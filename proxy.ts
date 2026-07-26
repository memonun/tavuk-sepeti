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
    return NextResponse.redirect(url);
  }

  if (userId && pathname === LOGIN_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = ADMIN_HOME;
    return NextResponse.redirect(url);
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
