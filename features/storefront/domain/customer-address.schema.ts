/**
 * Storefront address-book schema — the customer-facing twin of the admin
 * customer form's address block (`features/customers/domain/customer.schema.ts`).
 *
 * The difference is deliberate and is the whole point of this work: on the admin
 * side an operator can save a half-filled address and clean it up later, because
 * they are looking at the CRM. A customer typing their own address is the only
 * chance we get, and the route needs specific fields at the door. So for a
 * route-grade address `street`, `building_no` and `apartment_no` are REQUIRED —
 * they are exactly the fields `missingDeliveryFields` reports — plus a confirmed
 * map pin.
 *
 * Cargo addresses (anywhere in Türkiye, no van involved) keep the looser shape:
 * il / ilçe / mahalle are enough for a courier.
 *
 * CLAUDE.md §8 ("düşük accuracy sonuçlar onay olmadan kaydedilmez") gets a
 * concrete, enforceable meaning here: an `approximate`/`unknown` coordinate is
 * accepted ONLY when `source === "user_pin"`, i.e. the person standing at the
 * address dragged the pin onto their own door.
 */
import { z } from "zod";

import {
  coordinateAccuracySchema,
  coordinateSourceSchema,
} from "@/shared/geo/coordinate.schema";
import { isLowAccuracy } from "@/shared/geo/accuracy";

const blankToNull = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? null : value;

/** Fields every address has, route or cargo. */
const addressBase = {
  label: z.preprocess(blankToNull, z.string().trim().max(60).nullable()),
  city: z.string().trim().min(1, "İl gerekli.").max(100),
  district: z.string().trim().min(1, "İlçe gerekli.").max(100),
  neighborhood: z.string().trim().min(1, "Mahalle gerekli.").max(100),
  postal_code: z.string().trim().max(10).default(""),
  description: z.preprocess(blankToNull, z.string().trim().max(500).nullable()),
};

/**
 * Sentinel written into `apartment_no` when the customer ticks "Müstakil ev".
 * A detached house genuinely has no flat number, but leaving the field blank
 * would make every such stop show a red "Daire" chip on the route forever. This
 * records the real answer instead of an absence.
 */
export const DETACHED_HOUSE_APARTMENT_NO = "Müstakil";

export const routeAddressSchema = z
  .object({
    ...addressBase,
    street: z.string().trim().min(1, "Cadde / sokak gerekli.").max(150),
    building_no: z.string().trim().min(1, "Bina no gerekli.").max(20),
    apartment_no: z
      .string()
      .trim()
      .min(1, "Daire no gerekli (müstakil ev ise işaretleyin).")
      .max(20),
    lat: z.coerce.number().gte(-90).lte(90),
    lng: z.coerce.number().gte(-180).lte(180),
    accuracy: coordinateAccuracySchema,
    source: coordinateSourceSchema,
  })
  .superRefine((address, ctx) => {
    // (0,0) is the repo-wide "no pin" sentinel (delivery-readiness treats it as
    // missing), so it must never reach a route order.
    if (address.lat === 0 && address.lng === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lat"],
        message: "Haritadan teslimat konumunuzu onaylayın.",
      });
      return;
    }
    if (isLowAccuracy(address.accuracy) && address.source !== "user_pin") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lat"],
        message:
          "Konum yaklaşık. Lütfen haritadaki pini tam adresinize sürükleyin.",
      });
    }
  });

/**
 * A cargo address takes a pin too — OPTIONALLY.
 *
 * A courier still needs nothing but the written address, so the pin is never
 * required and its absence is the (0,0) sentinel exactly as before. But since
 * the form now opens on a map in both modes, a cargo customer routinely DOES
 * place one, and throwing it away would be the worst of both worlds: we ask for
 * a location, show it filling the fields, then silently forget it and later
 * tell the same customer their address "has no map pin" when they order fresh
 * products.
 *
 * The §8 rule still holds for whatever pin does arrive: an approximate
 * coordinate is only acceptable when the customer placed it themselves.
 */
export const cargoAddressSchema = z
  .object({
    ...addressBase,
    street: z.string().trim().max(150).default(""),
    building_no: z.string().trim().max(20).default(""),
    apartment_no: z.string().trim().max(20).default(""),
    lat: z.coerce.number().gte(-90).lte(90).default(0),
    lng: z.coerce.number().gte(-180).lte(180).default(0),
    accuracy: coordinateAccuracySchema.default("unknown"),
    source: coordinateSourceSchema.default("user_pin"),
  })
  .superRefine((address, ctx) => {
    const hasPin = address.lat !== 0 || address.lng !== 0;
    if (!hasPin) return;
    if (isLowAccuracy(address.accuracy) && address.source !== "user_pin") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lat"],
        message:
          "Konum yaklaşık. Lütfen haritadaki pini tam adresinize sürükleyin.",
      });
    }
  });

export type RouteAddressInput = z.input<typeof routeAddressSchema>;
export type RouteAddressParsed = z.output<typeof routeAddressSchema>;
export type CargoAddressInput = z.input<typeof cargoAddressSchema>;
export type CargoAddressParsed = z.output<typeof cargoAddressSchema>;

/** Which form the basket requires. Mirrors `requiredAddressMode` in
 *  fulfillment-channel.ts — the two must agree. */
export const addressModeSchema = z.enum(["route", "cargo"]);
export type AddressMode = z.output<typeof addressModeSchema>;

/** The account address-book editor payload (`/hesap` → "Adreslerim"). */
export const saveAddressSchema = z.object({
  /** Absent = create a new address; present = edit that one in place. */
  address_id: z.preprocess(blankToNull, z.string().uuid().nullable()),
  mode: addressModeSchema,
  make_primary: z.coerce.boolean().default(false),
  address: z.unknown(),
});
