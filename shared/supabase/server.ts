// Server-only Supabase client factory.
// Importing this from a Client Component is a runtime error (next/server-only),
// so the service-role helper below cannot accidentally ship to the browser.
import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { env } from "@/shared/env";

import type { Database } from "@/shared/supabase/types";

/**
 * SSR client — uses the **anon** key plus the user's auth cookies. RLS still
 * applies; queries run as whoever is logged in. This is what Server
 * Components and Server Actions should use for normal data access.
 *
 * The cookie adapter uses next/headers' async `cookies()` API. `setAll` is
 * a no-op outside a mutating context (the App Router only allows cookie
 * writes from Server Actions / Route Handlers); supabase-ssr swallows the
 * resulting error and that's fine — the next route hop will refresh.
 */
export async function createSupabaseServerClient() {
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
            // Server Components can't set cookies — ignore. The auth
            // middleware refreshes them on the next request.
          }
        },
      },
    },
  );
}
