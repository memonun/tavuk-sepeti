import { describe, expect, it } from "vitest";

import {
  freeCargoShortfallMinor,
  orderFeeMinor,
  qualifiesForFreeCargo,
  type OrderFeeRates,
} from "@/features/storefront/domain/order-fee";
import { DEFAULT_STOREFRONT_SETTINGS } from "@/features/storefront/domain/storefront-settings";
import { cargoFeeNotice } from "@/features/storefront/domain/storefront.config";

// The owner's rule as of 2026-10-22: 150 ₺ cargo, free from 1.000 ₺ up.
const rates: OrderFeeRates = {
  homeDeliveryFeeMinor: 5_000,
  cargoFeeMinor: 15_000,
  cargoFreeShippingThresholdMinor: 100_000,
};

describe("orderFeeMinor", () => {
  it("charges the cargo fee below the free-shipping threshold", () => {
    expect(orderFeeMinor("shipping", 99_999, rates)).toBe(15_000);
    expect(orderFeeMinor("shipping", 30_000, rates)).toBe(15_000);
  });

  // "1000 TL üzeri ücretsiz" — exactly 1.000 ₺ already ships free.
  it("ships free at and above the threshold", () => {
    expect(orderFeeMinor("shipping", 100_000, rates)).toBe(0);
    expect(orderFeeMinor("shipping", 250_000, rates)).toBe(0);
  });

  it("always charges the eve-servis fee on a delivery order, whatever the subtotal", () => {
    expect(orderFeeMinor("delivery", 10_000, rates)).toBe(5_000);
    expect(orderFeeMinor("delivery", 500_000, rates)).toBe(5_000);
  });

  it("threshold 0 means no free-shipping offer: the fee always applies", () => {
    const noThreshold = { ...rates, cargoFreeShippingThresholdMinor: 0 };
    expect(orderFeeMinor("shipping", 0, noThreshold)).toBe(15_000);
    expect(orderFeeMinor("shipping", 1_000_000, noThreshold)).toBe(15_000);
  });

  it("fee 0 means cargo is always free", () => {
    const free = { ...rates, cargoFeeMinor: 0 };
    expect(orderFeeMinor("shipping", 1, free)).toBe(0);
    expect(qualifiesForFreeCargo(1, free)).toBe(true);
  });

  it("the fallback defaults are the owner's 150 ₺ / 1.000 ₺", () => {
    expect(orderFeeMinor("shipping", 99_999, DEFAULT_STOREFRONT_SETTINGS)).toBe(15_000);
    expect(orderFeeMinor("shipping", 100_000, DEFAULT_STOREFRONT_SETTINGS)).toBe(0);
  });
});

describe("freeCargoShortfallMinor", () => {
  it("says how much more is needed below the threshold", () => {
    expect(freeCargoShortfallMinor(77_000, rates)).toBe(23_000);
  });

  it("is null once free, with no threshold, or with a 0 fee", () => {
    expect(freeCargoShortfallMinor(100_000, rates)).toBeNull();
    expect(freeCargoShortfallMinor(1, { ...rates, cargoFreeShippingThresholdMinor: 0 })).toBeNull();
    expect(freeCargoShortfallMinor(1, { ...rates, cargoFeeMinor: 0 })).toBeNull();
  });
});

describe("cargoFeeNotice", () => {
  it("states both the threshold and the fee", () => {
    const notice = cargoFeeNotice(rates);
    expect(notice).toContain("1.000,00 ₺ ve üzeri siparişlerde ücretsiz kargo");
    expect(notice).toContain("150,00 ₺");
  });

  it("states free shipping when the fee is 0", () => {
    expect(cargoFeeNotice({ ...rates, cargoFeeMinor: 0 })).toBe(
      "Türkiye'nin her yerine ücretsiz kargo.",
    );
  });

  it("states only the fee when there is no threshold", () => {
    const notice = cargoFeeNotice({ ...rates, cargoFreeShippingThresholdMinor: 0 });
    expect(notice).toBe("Türkiye'nin her yerine kargo ücreti 150,00 ₺.");
  });
});
