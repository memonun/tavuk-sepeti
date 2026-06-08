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

  const addr = parsed.data.address ?? null;
  const rawText = composeFullAddress(addr ?? {});

  // Build the update payload without setting keys to `undefined` — required by
  // exactOptionalPropertyTypes. Spread the optional scalar fields only when
  // they are non-null so the repository skips them (preserving existing values).
  const updateInput = {
    email: parsed.data.email ?? null,
    notes: parsed.data.notes ?? null,
    status: parsed.data.status,
    ...(parsed.data.first_name !== null ? { first_name: parsed.data.first_name } : {}),
    ...(parsed.data.last_name !== null ? { last_name: parsed.data.last_name } : {}),
    ...(parsed.data.phone !== null ? { phone: parsed.data.phone } : {}),
    ...(addr !== null
      ? {
          address: {
            raw_text: rawText,
            description: addr.description ?? null,
            city: addr.city ?? null,
            district: addr.district ?? null,
            neighborhood: addr.neighborhood ?? null,
            street: addr.street ?? null,
            building_no: addr.building_no ?? null,
            apartment_no: addr.apartment_no ?? null,
            postal_code: addr.postal_code ?? null,
            coordinate: {
              lat: addr.lat ?? 0,
              lng: addr.lng ?? 0,
              source: addr.source ?? "admin_corrected",
              accuracy: addr.accuracy ?? "unknown",
              geocoded_at:
                addr.source === "user_pin" ? null : new Date(),
              geocoder_response_hash: null,
            },
          },
        }
      : {}),
  };

  const updated = await repoUpdate(customerId, updateInput);

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
