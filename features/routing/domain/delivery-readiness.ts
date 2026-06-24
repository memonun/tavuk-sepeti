/**
 * Delivery-readiness check for a route stop.
 *
 * Before a driver leaves, every stop needs four things or the delivery
 * breaks down on the doorstep: a phone to call, an open street address, the
 * apartment number, and a map pin. The admin captures these on the customer
 * form ("Adres" → açık adres, "Daire" → daire, "Telefon", and the pin), but
 * any of them can be left blank or forgotten. This module is the single
 * source of truth for "is this stop missing something I should fix first?"
 * so the route page can flag it in red.
 *
 * `street`, `apartmentNo`, and `phone` are nullable at the DB level; the pin
 * (lat/lng) is NOT NULL but the form's pre-geocode default is (0, 0), so we
 * treat the null island the same as "no pin".
 */

/** Which required delivery field is missing. Order = display order. */
export type MissingDeliveryField = "phone" | "address" | "apartment" | "location";

/** Turkish labels for the warning chips — UI reads these, no inline strings. */
export const MISSING_FIELD_LABELS: Readonly<Record<MissingDeliveryField, string>> = {
  phone: "Telefon",
  address: "Açık adres",
  apartment: "Daire",
  location: "Konum",
};

/** The slice of a stop/order the check needs — both DayOrder and RouteStop
 *  can supply it. Live customer/address values, not order-time snapshots. */
export interface DeliveryReadinessInput {
  /** Customer phone (E.164) or null/blank when not captured. */
  readonly phone: string | null;
  /** Açık adres — the street line ("Adres" field). Null/blank = missing. */
  readonly street: string | null;
  /** Daire / apartment no. Null/blank = missing. */
  readonly apartmentNo: string | null;
  /** Map pin latitude. */
  readonly lat: number | null;
  /** Map pin longitude. */
  readonly lng: number | null;
}

const isBlank = (value: string | null): boolean =>
  value === null || value.trim().length === 0;

/** A pin is "missing" when absent or sitting on the (0, 0) null island —
 *  the form's pre-geocode default, which submit blocks but legacy/import
 *  rows may still carry. */
function hasNoLocation(lat: number | null, lng: number | null): boolean {
  if (lat === null || lng === null) return true;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;
  return lat === 0 && lng === 0;
}

/**
 * The required delivery fields that are blank, in display order. Empty array
 * means the stop is fully ready.
 */
export function missingDeliveryFields(
  input: DeliveryReadinessInput,
): MissingDeliveryField[] {
  const missing: MissingDeliveryField[] = [];
  if (isBlank(input.phone)) missing.push("phone");
  if (isBlank(input.street)) missing.push("address");
  if (isBlank(input.apartmentNo)) missing.push("apartment");
  if (hasNoLocation(input.lat, input.lng)) missing.push("location");
  return missing;
}
