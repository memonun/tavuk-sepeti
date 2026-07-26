import { NextResponse, type NextRequest } from "next/server";

import { refreshSupabaseSession } from "@/shared/supabase/session";

const LOGIN_PATH = "/login";

// Public, no-login route prefixes. The customer-facing storefront (Faz 2) is
// browsable and orderable by anonymous visitors, so it must never be bounced to
// the admin login. Everything else stays admin-gated (implicit deny).
const PUBLIC_PREFIXES = ["/magaza"];

function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith(LOGIN_PATH)) return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Next 16 proxy (formerly `middleware`).
 *
 * Runs before every request matched below. Refreshes the Supabase session
 * cookie and gates routes:
 *   - Unauthenticated request to a NON-public route → redirect to /login.
 *   - Authenticated request to /login              → redirect to / (admin home).
 *
 * Public routes (the storefront, /login) skip the auth redirect entirely, so a
 * logged-in admin browsing /magaza is left alone too.
 *
 * The matcher excludes static assets so we don't pay for cookie refresh on
 * every image or chunk.
 */
export async function proxy(request: NextRequest) {
  const { response, userId } = await refreshSupabaseSession(request);
  const pathname = request.nextUrl.pathname;

  if (!userId && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    return NextResponse.redirect(url);
  }

  if (userId && pathname.startsWith(LOGIN_PATH)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
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
