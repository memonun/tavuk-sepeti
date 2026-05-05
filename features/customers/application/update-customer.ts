"use server";

import { revalidatePath } from "next/cache";

import { customerFormSchema } from "@/features/customers/domain/customer.schema";
import { updateCustomer as repoUpdate } from "@/features/customers/infrastructure/customer.repository";
import { getCurrentUser } from "@/features/auth/application/get-session";
import { logger } from "@/shared/logger";

export type UpdateCustomerActionState =
  | { status: "idle" }
  | { status: "success"; customerId: string }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | { status: "error"; message: string };

export async function updateCustomerAction(
  customerId: string,
  _previous: UpdateCustomerActionState,
  formData: FormData,
): Promise<UpdateCustomerActionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Oturum bulunamadı, tekrar giriş yapın." };
  }

  const raw = {
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    notes: formData.get("notes"),
    status: formData.get("status") ?? "active",
    address: {
      raw_text: formData.get("address.raw_text"),
      description: formData.get("address.description"),
      lat: Number(formData.get("address.lat")),
      lng: Number(formData.get("address.lng")),
      source: formData.get("address.source"),
      accuracy: formData.get("address.accuracy"),
    },
  };

  const parsed = customerFormSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "validation_error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const updated = await repoUpdate(customerId, {
    first_name: parsed.data.first_name,
    last_name: parsed.data.last_name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    notes: parsed.data.notes,
    status: parsed.data.status,
    address: {
      raw_text: parsed.data.address.raw_text,
      description: parsed.data.address.description,
      coordinate: {
        lat: parsed.data.address.lat,
        lng: parsed.data.address.lng,
        source: parsed.data.address.source,
        accuracy: parsed.data.address.accuracy,
        geocoded_at:
          parsed.data.address.source === "user_pin" ? null : new Date(),
        geocoder_response_hash: null,
      },
    },
  });

  if (!updated.ok) {
    logger.error({ code: updated.error.code, customerId }, "update_customer_failed");
    return { status: "error", message: updated.error.message };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  return { status: "success", customerId };
}
