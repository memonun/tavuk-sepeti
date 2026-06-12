import { describe, expect, it } from "vitest";

import {
  priceOrderLine,
  rateForQuantity,
  type ProductPriceTier,
} from "@/features/products/domain/product-pricing";

// Egg tiers (kuruş/pkg): 1–2 → 125.00, 3 → 116.6667, 4+ → 112.50.
const eggTiers: ProductPriceTier[] = [
  { min_qty: 1, unit_price_minor: 12500 },
  { min_qty: 3, unit_price_minor: 11666.6667 },
  { min_qty: 4, unit_price_minor: 11250 },
];
const eggs = { tiers: eggTiers, basePriceMinor: 12500 };

describe("priceOrderLine — egg tiers", () => {
  const cases: Array<[number, number, number]> = [
    // quantity, expected unit_price_minor, expected line_total_minor
    [1, 12500, 12500], // ₺125.00
    [2, 12500, 25000], // ₺250.00
    [3, 11667, 35000], // ₺350.00 exactly — the load-bearing case
    [4, 11250, 45000], // ₺450.00
    [5, 11250, 56250], // ₺562.50
    [6, 11250, 67500], // ₺675.00
    [10, 11250, 112500], // ₺1125.00
  ];
  for (const [qty, unit, total] of cases) {
    it(`${qty} pkg → unit ${unit}, total ${total}`, () => {
      expect(priceOrderLine(qty, eggs)).toEqual({
        unit_price_minor: unit,
        line_total_minor: total,
      });
    });
  }
});

describe("priceOrderLine — flat (no tiers)", () => {
  const milk = { tiers: [], basePriceMinor: 4000 }; // ₺40.00/L
  it("uses the base price", () => {
    expect(priceOrderLine(2, milk)).toEqual({
      unit_price_minor: 4000,
      line_total_minor: 8000,
    });
  });
  it("handles fractional quantities (0.5 kg steps)", () => {
    const cheese = { tiers: [], basePriceMinor: 9000 }; // ₺90.00/kg
    expect(priceOrderLine(1.5, cheese)).toEqual({
      unit_price_minor: 9000,
      line_total_minor: 13500,
    });
  });
});

describe("priceOrderLine — customer override", () => {
  it("uses the flat override and ignores tiers", () => {
    // Eggs would normally tier to 11250 at qty 4; override pins ₺110/pkg.
    expect(
      priceOrderLine(4, { ...eggs, overrideUnitPriceMinor: 11000 }),
    ).toEqual({ unit_price_minor: 11000, line_total_minor: 44000 });
  });
  it("rounds the line total exactly for fractional overrides", () => {
    expect(
      priceOrderLine(3, { tiers: [], basePriceMinor: 0, overrideUnitPriceMinor: 11666.6667 }),
    ).toEqual({ unit_price_minor: 11667, line_total_minor: 35000 });
  });
});

describe("rateForQuantity", () => {
  it("falls back to base below the lowest tier", () => {
    const tiers: ProductPriceTier[] = [{ min_qty: 5, unit_price_minor: 100 }];
    expect(rateForQuantity(2, { tiers, basePriceMinor: 200 })).toBe(200);
  });
  it("picks the highest matching tier regardless of array order", () => {
    expect(rateForQuantity(4, eggs)).toBe(11250);
    expect(rateForQuantity(3, eggs)).toBe(11666.6667);
  });
});
