import "server-only";

import { createSupabaseServerClient } from "@/shared/supabase/server";

export interface SessionUser {
  id: string;
  email: string | null;
}

/**
 * Source-of-truth for "is the request authenticated?" inside Server
 * Components and Server Actions. Uses getUser() (validates JWT against
 * Supabase Auth) — never trust the cookie alone.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? null };
}
