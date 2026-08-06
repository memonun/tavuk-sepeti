import { describe, expect, it } from "vitest";

import {
  cargoAddressSchema,
  DETACHED_HOUSE_APARTMENT_NO,
  routeAddressSchema,
} from "@/features/storefront/domain/customer-address.schema";

const routeAddress = {
  label: "Ev",
  city: "Malatya",
  district: "Battalgazi",
  neighborhood: "Çavuşoğlu",
  street: "Atatürk Caddesi",
  building_no: "12",
  apartment_no: "3",
  postal_code: "44100",
  description: "",
  lat: 38.3552,
  lng: 38.3095,
  accuracy: "rooftop",
  source: "geocoded_manual",
};

describe("routeAddressSchema", () => {
  it("accepts a complete route-grade address", () => {
    const parsed = routeAddressSchema.parse(routeAddress);
    expect(parsed.street).toBe("Atatürk Caddesi");
    expect(parsed.description).toBeNull();
  });

  // These are exactly the fields missingDeliveryFields reports, which is why
  // they are required here and optional on the admin form: a customer typing
  // their own address is the only chance we get.
  it.each(["street", "building_no", "apartment_no"] as const)(
    "rejects a blank %s",
    (field) => {
      expect(routeAddressSchema.safeParse({ ...routeAddress, [field]: "" }).success).toBe(false);
      expect(routeAddressSchema.safeParse({ ...routeAddress, [field]: "   " }).success).toBe(false);
    },
  );

  it.each(["city", "district", "neighborhood"] as const)(
    "rejects a blank %s",
    (field) => {
      expect(routeAddressSchema.safeParse({ ...routeAddress, [field]: "" }).success).toBe(false);
    },
  );

  it("accepts the müstakil-ev sentinel as a flat number", () => {
    const parsed = routeAddressSchema.parse({
      ...routeAddress,
      apartment_no: DETACHED_HOUSE_APARTMENT_NO,
    });
    expect(parsed.apartment_no).toBe("Müstakil");
  });

  // (0,0) is the repo-wide "no pin" sentinel — delivery-readiness reports it as
  // a missing location, so it must never reach a route order.
  it("rejects the null island", () => {
    const res = routeAddressSchema.safeParse({ ...routeAddress, lat: 0, lng: 0 });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.issues[0]?.message).toMatch(/konumunuzu onaylayın/i);
  });

  // CLAUDE.md §8: an approximate coordinate may not be saved without
  // confirmation. On the storefront, "confirmed" means the person standing at
  // the address dragged the pin themselves.
  describe("low-accuracy pins (CLAUDE.md §8)", () => {
    it("rejects an approximate geocode the customer did not confirm", () => {
      const res = routeAddressSchema.safeParse({
        ...routeAddress,
        accuracy: "approximate",
        source: "geocoded_auto",
      });
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.error.issues[0]?.message).toMatch(/pini tam adresinize sürükleyin/i);
    });

    it("rejects an unknown-accuracy geocode the customer did not confirm", () => {
      expect(
        routeAddressSchema.safeParse({
          ...routeAddress,
          accuracy: "unknown",
          source: "geocoded_manual",
        }).success,
      ).toBe(false);
    });

    it("ACCEPTS an approximate pin the customer dragged themselves", () => {
      const res = routeAddressSchema.safeParse({
        ...routeAddress,
        accuracy: "approximate",
        source: "user_pin",
      });
      expect(res.success).toBe(true);
    });

    it("accepts a high-accuracy geocode without a manual drag", () => {
      expect(
        routeAddressSchema.safeParse({
          ...routeAddress,
          accuracy: "rooftop",
          source: "geocoded_auto",
        }).success,
      ).toBe(true);
    });
  });
});

describe("cargoAddressSchema", () => {
  const cargoAddress = {
    label: null,
    city: "İstanbul",
    district: "Kadıköy",
    neighborhood: "Caferağa",
    description: "",
  };

  // A courier delivers from the written address; there is no van to dispatch,
  // so no pin and no street-level detail is demanded.
  it("accepts an address anywhere in Türkiye with no pin", () => {
    const parsed = cargoAddressSchema.parse(cargoAddress);
    expect(parsed.street).toBe("");
    expect(parsed.building_no).toBe("");
    expect(parsed.apartment_no).toBe("");
    expect(parsed.postal_code).toBe("");
  });

  it("still requires il / ilçe / mahalle", () => {
    expect(cargoAddressSchema.safeParse({ ...cargoAddress, city: "" }).success).toBe(false);
    expect(cargoAddressSchema.safeParse({ ...cargoAddress, district: "" }).success).toBe(false);
    expect(cargoAddressSchema.safeParse({ ...cargoAddress, neighborhood: "" }).success).toBe(false);
  });
});
