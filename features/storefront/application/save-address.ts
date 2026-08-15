"use server";

/**
 * Save one of the signed-in customer's delivery addresses.
 *
 * This is where the storefront finally ENFORCES the delivery area, rather than
 * printing a notice about it:
 *
 *   1. Zod-parse (CLAUDE.md §4). For a route address that means street / bina /
 *      daire are required and the pin must be confirmed — the exact fields
 *      `missingDeliveryFields` reports, so a saved address is route-ready by
 *      construction.
 *   2. Ask PostGIS whether the confirmed pin falls inside a service area. The
 *      check is three-valued: "outside" rejects; "unconfigured" falls back to a
 *      Turkish-aware province-name compare and logs, so a missing polygon can
 *      never block every customer.
 *   3. Hand to the SECURITY DEFINER writer (customers have no INSERT policy).
 *
 * Cargo addresses skip the area check entirely — a courier goes anywhere in
 * Türkiye and there is no van to dispatch.
 */
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/features/auth/application/get-session";
import { validateCheckoutAddress } from "@/features/storefront/application/validate-checkout-address";
import { upsertCustomerAddress } from "@/features/storefront/infrastructure/customer-account.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { logger } from "@/shared/logger";
import { composeFullAddress } from "@/shared/utils/address";

export type SaveAddressState =
  | { status: "idle" }
  | { status: "success"; addressId: string }
  | { status: "validation_error"; message: string }
  | { status: "error"; message: string };

interface SaveAddressArgs {
  addressId: string | null;
  mode: "route" | "cargo";
  makePrimary: boolean;
  address: unknown;
}

export async function saveAddressAction(
  args: SaveAddressArgs,
): Promise<SaveAddressState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Oturum bulunamadı, tekrar giriş yapın." };
  }

  // The parse + service-area rule is shared with the guest checkout, which has
  // no address book and submits its address with the order.
  const validated = await validateCheckoutAddress(args.mode, args.address);
  if (!validated.ok) {
    return { status: "validation_error", message: validated.error.message };
  }
  const { address, geoVerified } = validated.value;

  const saved = await upsertCustomerAddress({
    authUserId: user.id,
    addressId: args.addressId,
    makePrimary: args.makePrimary,
    address: {
      label: address.label,
      raw_text: composeFullAddress(address),
      description: address.description,
      city: address.city,
      district: address.district,
      neighborhood: address.neighborhood,
      street: address.street,
      building_no: address.building_no,
      apartment_no: address.apartment_no,
      postal_code: address.postal_code,
      lat: address.lat,
      lng: address.lng,
      source: address.source,
      accuracy: address.accuracy,
      geo_verified: geoVerified,
    },
  });

  if (!saved.ok) {
    if (saved.error.code === "VALIDATION_ERROR") {
      return { status: "validation_error", message: saved.error.message };
    }
    logger.error({ code: saved.error.code }, "save_customer_address_failed");
    return { status: "error", message: "Adres kaydedilemedi, tekrar deneyin." };
  }

  await logAudit({
    actor_id: user.id,
    action: "address.web_updated",
    entity_type: "address",
    entity_id: saved.value,
    metadata: { mode: args.mode, geo_verified: geoVerified },
  });

  revalidatePath("/hesap");
  revalidatePath("/odeme");
  return { status: "success", addressId: saved.value };
}
