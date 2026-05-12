"use server";

import { revalidatePath, updateTag } from "next/cache";

import { CUSTOMER_FILTER_TAG } from "@/features/customers/application/get-filter-options";
import { customerFormSchema } from "@/features/customers/domain/customer.schema";
import {
  findCustomerById,
  updateCustomer as repoUpdate,
} from "@/features/customers/infrastructure/customer.repository";
import { getCurrentUser } from "@/features/auth/application/get-session";
import { logAudit } from "@/shared/audit/log-audit";
import { logger } from "@/shared/logger";
import { composeFullAddress } from "@/shared/utils/address";

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
      city: formData.get("address.city"),
      district: formData.get("address.district"),
      neighborhood: formData.get("address.neighborhood"),
      street: formData.get("address.street"),
      building_no: formData.get("address.building_no"),
      apartment_no: formData.get("address.apartment_no"),
      postal_code: formData.get("address.postal_code"),
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

  const rawText = composeFullAddress(parsed.data.address);

  const updated = await repoUpdate(customerId, {
    first_name: parsed.data.first_name,
    last_name: parsed.data.last_name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    notes: parsed.data.notes,
    status: parsed.data.status,
    address: {
      raw_text: rawText,
      description: parsed.data.address.description,
      city: parsed.data.address.city,
      district: parsed.data.address.district,
      neighborhood: parsed.data.address.neighborhood,
      street: parsed.data.address.street,
      building_no: parsed.data.address.building_no,
      apartment_no: parsed.data.address.apartment_no,
      postal_code: parsed.data.address.postal_code,
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

  // Snapshot the pre-update row for the audit "before" payload. Best-
  // effort: if it can't be loaded for some reason, we still log the
  // "after" + skip "before" rather than blocking the update.
  const beforeRow = await findCustomerById(customerId);
  const beforeSnapshot = beforeRow.ok
    ? {
        first_name: beforeRow.value.first_name,
        last_name: beforeRow.value.last_name,
        status: beforeRow.value.status,
        phone: beforeRow.value.phone,
      }
    : null;

  if (!updated.ok) {
    logger.error({ code: updated.error.code, customerId }, "update_customer_failed");
    return { status: "error", message: updated.error.message };
  }

  await logAudit({
    actor_id: user.id,
    action: "customer.updated",
    entity_type: "customer",
    entity_id: customerId,
    before: beforeSnapshot,
    after: {
      first_name: updated.value.first_name,
      last_name: updated.value.last_name,
      status: updated.value.status,
      phone: updated.value.phone,
    },
  });

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  // Tag/city/segment may have changed → bust the cached filter dropdowns.
  updateTag(CUSTOMER_FILTER_TAG);
  return { status: "success", customerId };
}
