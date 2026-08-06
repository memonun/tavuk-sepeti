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

/**
 * Create-or-return the CRM customer for a login (idempotent). Returns its id.
 *
 * Since migration 20260805090100 this NEVER matches an existing row by phone or
 * email: a storefront signup always writes a fresh `customers` row with
 * `origin='customer_web'`, and a legacy phone-ordered row holding the same
 * number is left completely untouched.
 */
export async function linkCustomerAccount(
  input: LinkCustomerInput,
): Promise<Result<string, AppError>> {
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
    // P0005 = the phone/email belongs to ANOTHER web account. The old code
    // silently nulled the colliding field, which produced accounts with no phone
    // and route stops flagged "Telefon eksik" for no visible reason.
    if (error.code === "P0005") {
      return err(
        new ValidationError({
          message:
            "Bu telefon veya e-posta başka bir hesapta kayıtlı. Giriş yapın ya da farklı bilgi girin.",
        }),
      );
    }
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

// ---- Address book -----------------------------------------------------------

/** The address payload the RPC accepts. Coordinates are required — a route
 *  address without a pin is not something we can dispatch a van to. */
export interface CustomerAddressPayload {
  label: string | null;
  raw_text: string;
  description: string | null;
  city: string;
  district: string;
  neighborhood: string;
  street: string;
  building_no: string;
  apartment_no: string;
  postal_code: string;
  lat: number;
  lng: number;
  source: string;
  accuracy: string;
  /** Stamps addresses.geo_verified_at — set when the pin passed the
   *  service-area check in the same request. */
  geo_verified: boolean;
}

export interface UpsertCustomerAddressInput {
  authUserId: string;
  /** null = create a new address; otherwise update that one in place. */
  addressId: string | null;
  address: CustomerAddressPayload;
  makePrimary: boolean;
}

/** Create or update one of the caller's own addresses. Returns its id. */
export async function upsertCustomerAddress(
  input: UpsertCustomerAddressInput,
): Promise<Result<string, AppError>> {
  const supabase = getSupabaseAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("upsert_customer_address", {
    p_auth_user_id: input.authUserId,
    p_address_id: input.addressId,
    p_address: input.address,
    p_make_primary: input.makePrimary,
  });
  if (error) {
    if (error.code === "P0004") {
      return err(
        new ValidationError({ message: "Bu adres hesabınıza ait değil." }),
      );
    }
    if (error.code === "P0006") {
      return err(
        new ValidationError({
          message: "Haritadan teslimat konumunuzu onaylayın.",
        }),
      );
    }
    if (error.code === "P0002") {
      return err(
        new ValidationError({
          message: "Profiliniz bulunamadı. Sayfayı yenileyip tekrar deneyin.",
        }),
      );
    }
    logger.error(
      { code: error.code, message: error.message },
      "upsert_customer_address_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(String(data));
}

/** Delete one of the caller's own addresses. */
export async function deleteCustomerAddress(
  authUserId: string,
  addressId: string,
): Promise<Result<void, AppError>> {
  const supabase = getSupabaseAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("delete_customer_address", {
    p_auth_user_id: authUserId,
    p_address_id: addressId,
  });
  if (error) {
    if (error.code === "P0004") {
      return err(
        new ValidationError({ message: "Bu adres hesabınıza ait değil." }),
      );
    }
    // orders.address_id is ON DELETE RESTRICT — an address with order history
    // cannot be removed, because the route still resolves those orders through it.
    if (error.code === "23503") {
      return err(
        new ValidationError({
          message:
            "Bu adrese ait siparişleriniz olduğu için silinemiyor. Yeni bir adres ekleyip onu varsayılan yapabilirsiniz.",
        }),
      );
    }
    logger.error(
      { code: error.code, message: error.message },
      "delete_customer_address_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}
