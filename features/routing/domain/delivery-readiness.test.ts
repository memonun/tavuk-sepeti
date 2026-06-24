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
});
