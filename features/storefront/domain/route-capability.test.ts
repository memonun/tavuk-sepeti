import { describe, expect, it } from "vitest";

import {
  hasPin,
  isRouteCapable,
  isRouteUpgradeEligible,
  routeBlockReason,
} from "@/features/storefront/domain/route-capability";
import { DELIVERY_PROVINCE } from "@/features/storefront/domain/storefront.config";

const inProvince = { lat: 38.3552, lng: 38.3095, city: DELIVERY_PROVINCE };

describe("hasPin", () => {
  it("treats the null island as no pin", () => {
    expect(hasPin({ lat: 0, lng: 0 })).toBe(false);
  });

  it("counts a pin with a zero on ONE axis", () => {
    // A real coordinate can legitimately have lat 0 or lng 0; only both being
    // zero is the sentinel.
    expect(hasPin({ lat: 0, lng: 38.3 })).toBe(true);
    expect(hasPin({ lat: 38.3, lng: 0 })).toBe(true);
  });
});

describe("isRouteCapable", () => {
  it("accepts a pinned address in the delivery province", () => {
    expect(isRouteCapable(inProvince)).toBe(true);
  });

  it("rejects an address with no pin", () => {
    expect(isRouteCapable({ ...inProvince, lat: 0, lng: 0 })).toBe(false);
  });

  it("rejects a pinned address in another province", () => {
    // The regression this predicate exists for: a cargo address now keeps its
    // pin, so pin-presence alone would offer İstanbul for a van delivery.
    expect(isRouteCapable({ lat: 41.0082, lng: 28.9784, city: "İstanbul" })).toBe(
      false,
    );
  });

  it("is Turkish-case insensitive about the province name", () => {
    expect(isRouteCapable({ ...inProvince, city: "MALATYA" })).toBe(true);
    expect(isRouteCapable({ ...inProvince, city: "malatya" })).toBe(true);
  });

  it("rejects a missing city rather than assuming the delivery province", () => {
    expect(isRouteCapable({ ...inProvince, city: null })).toBe(false);
    expect(isRouteCapable({ ...inProvince, city: "" })).toBe(false);
  });
});

describe("routeBlockReason", () => {
  it("is null when the address can take a van delivery", () => {
    expect(routeBlockReason(inProvince)).toBeNull();
  });

  it("reports a missing pin before anything else", () => {
    expect(routeBlockReason({ lat: 0, lng: 0, city: "İstanbul" })).toBe("no_pin");
  });

  it("reports the province when the pin is fine", () => {
    expect(
      routeBlockReason({ lat: 41.0082, lng: 28.9784, city: "İstanbul" }),
    ).toBe("other_province");
  });

  it("agrees with isRouteCapable in every case", () => {
    const cases = [
      inProvince,
      { ...inProvince, lat: 0, lng: 0 },
      { lat: 41.0082, lng: 28.9784, city: "İstanbul" },
      { ...inProvince, city: null },
    ];
    for (const c of cases) {
      expect(routeBlockReason(c) === null).toBe(isRouteCapable(c));
    }
  });
});

describe("isRouteUpgradeEligible", () => {
  const ready = { geo_verified: true, street: "Atatürk Cd.", apartment_no: "3" };

  it("accepts a geo-verified address with door detail", () => {
    expect(isRouteUpgradeEligible(ready)).toBe(true);
  });

  // Stricter than isRouteCapable on purpose: a same-province guess is not
  // enough to upgrade a flexible-only basket, only a real PostGIS "inside"
  // hit (geo_verified) is.
  it("rejects an address that was never geo-verified, even with door detail", () => {
    expect(isRouteUpgradeEligible({ ...ready, geo_verified: false })).toBe(false);
  });

  it("rejects a geo-verified address missing street or apartment_no", () => {
    expect(isRouteUpgradeEligible({ ...ready, street: "" })).toBe(false);
    expect(isRouteUpgradeEligible({ ...ready, apartment_no: "" })).toBe(false);
    expect(isRouteUpgradeEligible({ ...ready, street: "   " })).toBe(false);
  });
});
