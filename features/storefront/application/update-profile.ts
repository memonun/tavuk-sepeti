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

  revalidatePath("/hesap");
  return { status: "success" };
}
