import "server-only";

/**
 * Storefront ↔ CRM customer linkage. Both writers are SECURITY DEFINER RPCs
 * (service_role only) — the sanctioned way for the storefront to touch the
 * shared `customers` table without a customer-facing write policy, mirroring
 * web-order.repository's use of place_web_order.
 *
 * The RPCs aren't in the generated Database type yet, so this uses the
 * un-generated-RPC cast pattern used elsewhere in the codebase.
 */
import {
  AppError,
  ExternalApiError,
  ValidationError,
} from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";

export interface LinkCustomerInput {
  authUserId: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
}

/** Create-or-link the CRM customer for a login (idempotent). Returns its id. */
export async function linkCustomerAccount(
  input: LinkCustomerInput,
): Promise<Result<string, ExternalApiError>> {
  const supabase = getSupabaseAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("link_customer_account", {
    p_auth_user_id: input.authUserId,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_phone: input.phone,
    p_email: input.email,
  });
  if (error) {
    logger.error(
      { code: error.code, message: error.message },
      "link_customer_account_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(String(data));
}

export interface UpdateProfileInput {
  authUserId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}

/** Overwrite the caller's own linked customer (name + phone). */
export async function updateCustomerProfile(
  input: UpdateProfileInput,
): Promise<Result<void, AppError>> {
  const supabase = getSupabaseAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("update_customer_profile", {
    p_auth_user_id: input.authUserId,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_phone: input.phone,
  });
  if (error) {
    // P0003 = phone already belongs to another customer (see migration).
    if (error.code === "P0003") {
      return err(
        new ValidationError({
          message: "Bu telefon numarası başka bir hesapta kayıtlı.",
        }),
      );
    }
    // P0002 = no linked customer row (shouldn't happen once linked at signup).
    if (error.code === "P0002") {
      return err(
        new ValidationError({
          message: "Profiliniz bulunamadı. Sayfayı yenileyip tekrar deneyin.",
        }),
      );
    }
    logger.error(
      { code: error.code, message: error.message },
      "update_customer_profile_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}
