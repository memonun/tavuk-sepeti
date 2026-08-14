import "server-only";

/**
 * Parse a customer-entered address and decide whether we may deliver to it.
 *
 * Extracted so the two checkout paths cannot drift apart. `saveAddressAction`
 * (signed-in customer, address saved before the order) and the guest order
 * (address submitted WITH the order, because a guest has no address book) must
 * apply the same rule — and this is the rule that decides whether a van is sent
 * to a pin, so two copies of it is the kind of divergence nobody notices until
 * a driver is standing somewhere we do not serve.
 *
 * The area check is three-valued on purpose:
 *
 *   inside       → verified, proceed.
 *   outside      → refuse. Only an explicit "outside" refuses.
 *   unconfigured → no polygon exists yet. Falling back to a Turkish-aware
 *                  province-name compare means a missing service area degrades
 *                  to a weaker check instead of rejecting every customer.
 *
 * A cargo address is never refused on area — a courier goes anywhere in Türkiye.
 * It is still checked when it happens to carry a pin, but only to decide whether
 * that same address may later serve a ROUTE order.
 */
import { DELIVERY_PROVINCE } from "@/features/storefront/domain/storefront.config";
import {
  cargoAddressSchema,
  routeAddressSchema,
} from "@/features/storefront/domain/customer-address.schema";
import { checkServiceArea } from "@/features/storefront/infrastructure/service-area.repository";
import { ValidationError } from "@/shared/errors/app-error";
import { isSameProvince } from "@/shared/geo/tr-province";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

/** The flat shape both address schemas normalise into. */
export interface CheckoutAddress {
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
}

export interface ValidatedCheckoutAddress {
  address: CheckoutAddress;
  /** True only when PostGIS actually answered "inside" — stamps geo_verified_at. */
  geoVerified: boolean;
}

export async function validateCheckoutAddress(
  mode: "route" | "cargo",
  raw: unknown,
): Promise<Result<ValidatedCheckoutAddress, ValidationError>> {
  // Parsed per mode and normalised into one shape. Only a route address carries
  // a required pin, so the two schemas genuinely differ — the branch keeps that
  // distinction rather than casting it away.
  let address: CheckoutAddress;

  if (mode === "route") {
    const parsed = routeAddressSchema.safeParse(raw);
    if (!parsed.success) {
      return err(
        new ValidationError({
          message: parsed.error.issues[0]?.message ?? "Adres bilgileri eksik.",
        }),
      );
    }
    address = { ...parsed.data };
  } else {
    const parsed = cargoAddressSchema.safeParse(raw);
    if (!parsed.success) {
      return err(
        new ValidationError({
          message: parsed.error.issues[0]?.message ?? "Adres bilgileri eksik.",
        }),
      );
    }
    address = { ...parsed.data };
  }

  let geoVerified = false;

  if (mode === "cargo") {
    if (address.lat !== 0 || address.lng !== 0) {
      // Non-blocking: being outside the van's area is not a reason to refuse a
      // parcel. Failures degrade to "not verified", never to a refused address.
      const area = await checkServiceArea(address.lat, address.lng);
      if (!area.ok) {
        logger.warn(
          { code: area.error.code },
          "cargo_pin_service_area_check_unavailable",
        );
      } else if (area.value === "inside") {
        geoVerified = true;
      }
    }
    return ok({ address, geoVerified });
  }

  const area = await checkServiceArea(address.lat, address.lng);

  if (!area.ok) {
    // Infrastructure failure — don't strand the customer on it; fall back to the
    // province name and record that we did.
    logger.warn({ code: area.error.code }, "service_area_check_unavailable");
    if (!isSameProvince(address.city, DELIVERY_PROVINCE)) {
      return err(
        new ValidationError({
          message: `Taze ürünlerimiz yalnızca ${DELIVERY_PROVINCE} içinde teslim edilir.`,
        }),
      );
    }
  } else if (area.value === "outside") {
    // District + neighbourhood only — never the full address (CLAUDE.md §6 keeps
    // PII out of logs). Enough to spot a polygon cutting off a real neighbourhood.
    logger.warn(
      { district: address.district, neighborhood: address.neighborhood },
      "address_rejected_outside_service_area",
    );
    return err(
      new ValidationError({
        message: `Bu adres teslimat bölgemizin dışında. Taze ürünler yalnızca ${DELIVERY_PROVINCE} içinde teslim edilir.`,
      }),
    );
  } else if (area.value === "unconfigured") {
    logger.warn({}, "service_area_unconfigured_string_fallback");
    if (!isSameProvince(address.city, DELIVERY_PROVINCE)) {
      return err(
        new ValidationError({
          message: `Taze ürünlerimiz yalnızca ${DELIVERY_PROVINCE} içinde teslim edilir.`,
        }),
      );
    }
  } else {
    geoVerified = true;
  }

  return ok({ address, geoVerified });
}
