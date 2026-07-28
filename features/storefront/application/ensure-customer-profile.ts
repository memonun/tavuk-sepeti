import "server-only";

/**
 * Ensure the logged-in customer has a linked CRM `customers` row. Idempotent
 * and cheap — the RPC no-ops when the row already exists and is complete.
 * Called on account load so accounts created before customer-linking (or via a
 * path that skipped it) self-heal from the auth user's signup metadata.
 */
import { linkCustomerAccount } from "@/features/storefront/infrastructure/customer-account.repository";
import { logger } from "@/shared/logger";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export async function ensureCustomerProfile(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const meta = (user.user_metadata ?? {}) as {
    first_name?: unknown;
    last_name?: unknown;
    phone?: unknown;
  };

  const result = await linkCustomerAccount({
    authUserId: user.id,
    firstName: typeof meta.first_name === "string" ? meta.first_name : null,
    lastName: typeof meta.last_name === "string" ? meta.last_name : null,
    phone: typeof meta.phone === "string" ? meta.phone : null,
    email: user.email ?? null,
  });
  if (!result.ok) {
    logger.warn({ code: result.error.code }, "ensure_customer_profile_failed");
  }
}
