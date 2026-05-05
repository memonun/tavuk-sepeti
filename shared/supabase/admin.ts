// Service-role client — RLS bypass. Server-only by design.
//
// Use this for:
//   - Cron / scheduled jobs that act on behalf of no user.
//   - Admin operations that need to read across users (e.g., audit reports).
//   - System-internal writes triggered by webhooks.
//
// NEVER use this from a Server Action or Route Handler that's responding
// to a user request unless the user has been authorized at the layer above
// AND you specifically need RLS bypass. The default for user-driven flows
// is `createSupabaseServerClient()` from ./server.ts so RLS still applies.
import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/shared/env";

import type { Database } from "@/shared/supabase/types";

let cached: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Returns a singleton service-role client. Singleton because:
 *   - The client maintains its own connection pool internally.
 *   - persistSession: false means there's no per-request state to leak.
 *
 * If you need a fresh client for testing, import `createClient` directly
 * from `@supabase/supabase-js` instead.
 */
export function getSupabaseAdminClient() {
  if (cached) return cached;
  cached = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        // Service-role tokens are not session credentials — don't try to
        // refresh, persist, or auto-detect them in URLs.
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
  return cached;
}
