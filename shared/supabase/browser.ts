// Browser Supabase client — for Client Components only.
//
// Uses the public anon key (referrer-restricted in the dashboard). The user's
// session is read from cookies set by the auth middleware. RLS applies.
import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/shared/env";

import type { Database } from "@/shared/supabase/types";

/**
 * Per-Supabase-docs guidance: a Client Component should call this once per
 * render hook (`useMemo` / `useState`) rather than instantiate at module
 * level — the latter would create the client on the server during SSR
 * pre-render, which we want to avoid.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
