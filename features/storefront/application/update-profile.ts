"use server";

/**
 * Customer profile editor ("Bilgilerim"): update the logged-in customer's name
 * and phone. Zod-parsed first; the write goes through the service-role RPC,
 * scoped server-side to the verified session user so a customer can only edit
 * their own row.
 */
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/features/auth/application/get-session";
import { customerProfileSchema } from "@/features/storefront/domain/customer-auth.schema";
import { updateCustomerProfile } from "@/features/storefront/infrastructure/customer-account.repository";
import { ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export type UpdateProfileState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

export async function updateProfileAction(
  _previous: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Oturumunuz sonlanmış. Tekrar giriş yapın." };
  }

  const parsed = customerProfileSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Geçersiz bilgi.",
    };
  }

  const result = await updateCustomerProfile({
    authUserId: user.id,
    firstName: parsed.data.first_name,
    lastName: parsed.data.last_name,
    phone: parsed.data.phone,
  });
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.error instanceof ValidationError
          ? result.error.message
          : "Bilgiler kaydedilemedi, tekrar deneyin.",
    };
  }

  // Keep auth metadata in step with the `customers` row. The checkout builds its
  // identity from `user_metadata` (checkout-account.ts), so writing only the CRM
  // row left two answers to "what is this customer's phone?" — and the stale one
  // is the copy handed to PayTR (`place-order.ts`, `userPhone`). Best-effort: the
  // authoritative record is already saved, so a failure here must not report the
  // edit as failed. It is logged rather than swallowed (CLAUDE.md §5).
  const supabase = await createSupabaseServerClient();
  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      phone: parsed.data.phone,
    },
  });
  if (metadataError) {
    logger.warn(
      { supabaseStatus: metadataError.status, code: metadataError.code },
      "customer_profile_metadata_sync_failed",
    );
  }

  revalidatePath("/hesap");
  revalidatePath("/odeme");
  return { status: "success" };
}
