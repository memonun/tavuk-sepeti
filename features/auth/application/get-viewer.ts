import "server-only";

/**
 * Lightweight viewer probe for UI that adapts to who's looking (e.g. the
 * storefront header showing an "admin panel" button). Returns whether there's a
 * session and whether that user is an admin — in a single getUser + is_admin
 * round-trip, and WITHOUT the denial logging that assertAdmin emits (a customer
 * isn't being "denied" anything by browsing the shop).
 *
 * Anonymous visitors cost just the getUser check — the is_admin RPC only runs
 * when a session exists.
 */
import { logger } from "@/shared/logger";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export interface Viewer {
  authed: boolean;
  isAdmin: boolean;
}

export async function getViewer(): Promise<Viewer> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { authed: false, isAdmin: false };

  const { data, error } = await supabase.rpc("is_admin");
  if (error) {
    logger.warn({ code: error.code }, "get_viewer_is_admin_failed");
    return { authed: true, isAdmin: false };
  }
  return { authed: true, isAdmin: data === true };
}
