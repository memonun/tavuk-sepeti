// Server-only Supabase client factory.
// Importing this from a Client Component is a runtime error (next/server-only),
// so the service-role helper below cannot accidentally ship to the browser.
import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

import { env } from "@/shared/env";

import type { Database } from "@/shared/supabase/types";

/**
 * SSR client — uses the **anon** key plus the user's auth cookies. RLS still
 * applies; queries run as whoever is logged in. This is what Server
 * Components and Server Actions should use for normal data access.
 *
 * ONE CLIENT PER REQUEST (React `cache`). This is not an optimisation, it is a
 * correctness requirement.
 *
 * `supabase-ssr` server clients are created with `autoRefreshToken: false` but
 * `persistSession: true`, so a client refreshes lazily inside `getUser()` when
 * the access token has expired — and Supabase ROTATES the refresh token when it
 * does, killing the old one immediately. Rendering /odeme used to build four
 * independent clients (the proxy, `ensureCustomerProfile`, `getMyAccount`,
 * `listMyAddresses`), each holding its own copy of the session and each capable
 * of starting its own refresh. Whichever one rotated first left the others
 * holding a token the server had already invalidated, and the customer was
 * signed out mid-checkout with no explanation.
 *
 * Sharing one client means one session state and one refresh per request.
 *
 * The cookie adapter uses next/headers' async `cookies()` API. `setAll` is
 * a no-op outside a mutating context (the App Router only allows cookie
 * writes from Server Actions / Route Handlers); supabase-ssr swallows the
 * resulting error, and the proxy — which CAN write — refreshes on the way in,
 * so a Server Component should never be the one rotating the token.
 */
export const createSupabaseServerClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components can't set cookies — ignore. The proxy
            // refreshes them on the way in, where writes are allowed.
          }
        },
      },
    },
  );
});
