"use server";

/**
 * Customer create flow: parse → enforce auth → persist (customer + address) →
 * revalidate the list page.
 *
 * The form already supplies lat/lng/source/accuracy — geocoding happened
 * client-side via geocodeAddressAction when the user typed the address.
 * The server action does not re-geocode; it trusts the parsed input
 * (which Zod has validated for shape and ranges).
 *
 * Returns a serializable result — UI uses this with useActionState.
 */
import { revalidatePath, updateTag } from "next/cache";

import { CUSTOMER_FILTER_TAG } from "@/features/customers/application/get-filter-options";
import { customerFormSchema } from "@/features/customers/domain/customer.schema";
import { createCustomer as repoCreate } from "@/features/customers/infrastructure/customer.repository";
import { getCurrentUser } from "@/features/auth/application/get-session";
import { logAudit } from "@/shared/audit/log-audit";
import { logger } from "@/shared/logger";
import { composeFullAddress } from "@/shared/utils/address";

export type CreateCustomerActionState =
  | { status: "idle" }
  | { status: "success"; customerId: string }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | { status: "error"; message: string };

export async function createCustomerAction(
  _previous: CreateCustomerActionState,
  formData: FormData,
): Promise<CreateCustomerActionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Oturum bulunamadı, tekrar giriş yapın." };
  }

  // Parse the flat form payload. Zod schema is shared with the UI so the
  // shape is locked in.
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

  // Compose the legacy raw_text from the structured fields. Stored for
  // table display + search fallback; the structured fields remain the
  // source of truth.
  const rawText = composeFullAddress(parsed.data.address);

  const created = await repoCreate({
    first_name: parsed.data.first_name,
    last_name: parsed.data.last_name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    notes: parsed.data.notes,
    status: parsed.data.status,
    created_by: user.id,
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
        // The form-driven flow always carries a fresh hash from the geocode
        // action; null means an admin dropped a pure manual pin without ever
        // calling Google (rare, but valid).
        geocoded_at: parsed.data.address.source === "user_pin" ? null : new Date(),
        geocoder_response_hash: null,
      },
    },
  });

  if (!created.ok) {
    logger.error({ code: created.error.code }, "create_customer_failed");
    return { status: "error", message: created.error.message };
  }

  await logAudit({
    actor_id: user.id,
    action: "customer.created",
    entity_type: "customer",
    entity_id: created.value.id,
    after: {
      first_name: created.value.first_name,
      last_name: created.value.last_name,
      status: created.value.status,
      address_city: created.value.address.city,
    },
  });

  revalidatePath("/customers");
  // Drop the cached filter-dropdown options so a new tag / city appears
  // immediately the next time someone opens /customers. `updateTag` is
  // the Next 16 server-action-side primitive (read-your-own-writes).
  updateTag(CUSTOMER_FILTER_TAG);
  return { status: "success", customerId: created.value.id };
}
