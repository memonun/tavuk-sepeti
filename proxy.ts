import { NextResponse, type NextRequest } from "next/server";

import { refreshSupabaseSession } from "@/shared/supabase/session";

const LOGIN_PATH = "/login";

/**
 * Next 16 proxy (formerly `middleware`).
 *
 * Runs before every request matched below. Refreshes the Supabase session
 * cookie and gates routes:
 *   - Unauthenticated request to anything except /login → redirect to /login.
 *   - Authenticated request to /login                → redirect to / (admin home).
 *
 * The matcher excludes static assets so we don't pay for cookie refresh on
 * every image or chunk.
 */
export async function proxy(request: NextRequest) {
  const { response, userId } = await refreshSupabaseSession(request);
  const pathname = request.nextUrl.pathname;

  if (!userId && !pathname.startsWith(LOGIN_PATH)) {
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
