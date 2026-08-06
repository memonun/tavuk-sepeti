import { describe, expect, it } from "vitest";

import {
  missingDeliveryFields,
  type DeliveryReadinessInput,
} from "@/features/routing/domain/delivery-readiness";

const complete: DeliveryReadinessInput = {
  phone: "+905321234567",
  street: "Atatürk Cd.",
  apartmentNo: "3",
  lat: 41.0,
  lng: 29.0,
};

describe("missingDeliveryFields", () => {
  it("returns nothing when every field is present", () => {
    expect(missingDeliveryFields(complete)).toEqual([]);
  });

  it("flags a null phone", () => {
    expect(missingDeliveryFields({ ...complete, phone: null })).toEqual(["phone"]);
  });

  it("treats a whitespace-only field as blank", () => {
    expect(missingDeliveryFields({ ...complete, street: "   " })).toEqual([
      "address",
    ]);
  });

  it("flags a missing apartment (daire)", () => {
    expect(missingDeliveryFields({ ...complete, apartmentNo: "" })).toEqual([
      "apartment",
    ]);
  });

  it("flags a null pin", () => {
    expect(
      missingDeliveryFields({ ...complete, lat: null, lng: null }),
    ).toEqual(["location"]);
  });

  it("treats the (0,0) null island as no pin", () => {
    expect(missingDeliveryFields({ ...complete, lat: 0, lng: 0 })).toEqual([
      "location",
    ]);
  });

  it("does not flag a legitimate zero crossing on one axis only", () => {
    expect(
      missingDeliveryFields({ ...complete, lat: 41.0, lng: 0 }),
    ).toEqual([]);
  });

  it("flags non-finite coordinates", () => {
    expect(
      missingDeliveryFields({ ...complete, lat: Number.NaN, lng: 29.0 }),
    ).toEqual(["location"]);
  });

  it("reports all four in display order when everything is blank", () => {
    expect(
      missingDeliveryFields({
        phone: null,
        street: null,
        apartmentNo: null,
        lat: 0,
        lng: 0,
      }),
    ).toEqual(["phone", "address", "apartment", "location"]);
  });

  // is_within_service_area is three-valued: only an explicit `false` means the
  // pin is provably outside a configured zone. NULL means no zone exists yet, and
  // painting every stop red in that case would be worse than saying nothing.
  describe("service area", () => {
    it("flags a pin outside the configured delivery zone", () => {
      expect(
        missingDeliveryFields({ ...complete, inServiceArea: false }),
      ).toEqual(["outside_area"]);
    });

    it("does not flag a pin inside the zone", () => {
      expect(
        missingDeliveryFields({ ...complete, inServiceArea: true }),
      ).toEqual([]);
    });

    it("stays silent when no service area is configured", () => {
      expect(
        missingDeliveryFields({ ...complete, inServiceArea: null }),
      ).toEqual([]);
      expect(
        missingDeliveryFields({ ...complete, inServiceArea: undefined }),
      ).toEqual([]);
      // Omitting the field entirely must behave the same as null.
      expect(missingDeliveryFields(complete)).toEqual([]);
    });

    it("reports outside_area last, after the missing-field chips", () => {
      expect(
        missingDeliveryFields({
          phone: null,
          street: null,
          apartmentNo: null,
          lat: 0,
          lng: 0,
          inServiceArea: false,
        }),
      ).toEqual(["phone", "address", "apartment", "location", "outside_area"]);
    });
  });
});
