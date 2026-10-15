// Auth middleware helper — refreshes the user's Supabase session on every
// request and exposes whether a user is signed in.
//
// Called from `middleware.ts` at the repo root. Splitting the heavy lifting
// out of middleware.ts keeps that file's matcher config readable and lets
// us unit-test the auth logic separately.
import "server-only";

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/shared/env";

import type { Database } from "@/shared/supabase/types";

export interface SessionResult {
  /** Mutated response carrying any refreshed Supabase cookies. Always return this. */
  response: NextResponse;
  /** Authenticated user id, or null when no session. Cheap RLS-aware check. */
  userId: string | null;
}

export async function refreshSupabaseSession(
  request: NextRequest,
): Promise<SessionResult> {
  // Start with a passthrough response — supabase-ssr will mutate its cookies
  // in place when it refreshes a session. Don't replace this object.
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Mirror cookies to BOTH the request (so any later code in this
          // request sees the refreshed session) and the response (so the
          // browser persists them).
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getClaims() verifies the access token's SIGNATURE against the project's
  // public key (ES256, JWKS cached per server instance) — no round trip to
  // Supabase Auth on every request, unlike getUser(). getSession() alone would
  // only decode the cookie, which a client could forge. Like getUser(), it
  // refreshes an expired session first and hands the rotated cookies to
  // setAll above. The admin layout still calls getUser() + is_admin() before
  // rendering anything privileged; this only decides the /login redirect.
  const { data } = await supabase.auth.getClaims();

  return { response, userId: data?.claims.sub ?? null };
}
