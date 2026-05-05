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

  // IMPORTANT: getUser() validates the JWT against Supabase Auth. getSession()
  // would only decode the local cookie, which a malicious client could forge.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, userId: user?.id ?? null };
}
