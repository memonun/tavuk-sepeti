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
import { DELIVERY_PROVINCE } from "@/features/storefront/domain/storefront.config";
import {
  cargoAddressSchema,
  routeAddressSchema,
} from "@/features/storefront/domain/customer-address.schema";
import { upsertCustomerAddress } from "@/features/storefront/infrastructure/customer-account.repository";
import { checkServiceArea } from "@/features/storefront/infrastructure/service-area.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { isSameProvince } from "@/shared/geo/tr-province";
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

  // Parse per mode and normalise into one flat shape. Only a route address
  // carries a pin, so the two schemas produce genuinely different outputs — the
  // branch here keeps that distinction instead of casting it away.
  //
  // A cargo address has no pin. The RPC requires coordinates, so it is stored on
  // the null island — which is exactly how delivery-readiness reports "no pin",
  // and it can never reach the route because a cargo order's frozen channel
  // keeps it off it.
  let address: {
    label: string | null;
    city: string;
    district: string;
    neighborhood: string;
    street: string;
    building_no: string;
    apartment_no: string;
    postal_code: string;
    description: string | null;
    lat: number;
    lng: number;
    source: string;
    accuracy: string;
  };

  if (args.mode === "route") {
    const parsed = routeAddressSchema.safeParse(args.address);
    if (!parsed.success) {
      return {
        status: "validation_error",
        message: parsed.error.issues[0]?.message ?? "Adres bilgileri eksik.",
      };
    }
    address = { ...parsed.data };
  } else {
    const parsed = cargoAddressSchema.safeParse(args.address);
    if (!parsed.success) {
      return {
        status: "validation_error",
        message: parsed.error.issues[0]?.message ?? "Adres bilgileri eksik.",
      };
    }
    address = {
      ...parsed.data,
      lat: 0,
      lng: 0,
      source: "user_pin",
      accuracy: "unknown",
    };
  }

  let geoVerified = false;

  if (args.mode === "route") {
    const area = await checkServiceArea(address.lat, address.lng);

    if (!area.ok) {
      // The check itself failed (DB/network). Don't strand the customer on an
      // infrastructure problem — fall back to the province name and record it.
      logger.warn({ code: area.error.code }, "service_area_check_unavailable");
      if (!isSameProvince(address.city, DELIVERY_PROVINCE)) {
        return {
          status: "validation_error",
          message: `Taze ürünlerimiz yalnızca ${DELIVERY_PROVINCE} içinde teslim edilir.`,
        };
      }
    } else if (area.value === "outside") {
      // District + neighbourhood only — never the full address (CLAUDE.md §6
      // keeps PII out of logs). Enough to spot a polygon cutting off a real
      // neighbourhood.
      logger.warn(
        { district: address.district, neighborhood: address.neighborhood },
        "address_rejected_outside_service_area",
      );
      return {
        status: "validation_error",
        message: `Bu adres teslimat bölgemizin dışında. Taze ürünler yalnızca ${DELIVERY_PROVINCE} içinde teslim edilir.`,
      };
    } else if (area.value === "unconfigured") {
      logger.warn({}, "service_area_unconfigured_string_fallback");
      if (!isSameProvince(address.city, DELIVERY_PROVINCE)) {
        return {
          status: "validation_error",
          message: `Taze ürünlerimiz yalnızca ${DELIVERY_PROVINCE} içinde teslim edilir.`,
        };
      }
    } else {
      geoVerified = true;
    }
  }

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
