import { describe, expect, it } from "vitest";

import {
  priceOrderLine,
  type ProductPriceTier,
} from "@/features/products/domain/product-pricing";

// Egg tiers (kuruş/pkg): 1st pkg ₺130, 2nd ₺120, 3rd onward ₺100.
const eggTiers: ProductPriceTier[] = [
  { min_qty: 1, unit_price_minor: 13000 },
  { min_qty: 2, unit_price_minor: 12000 },
  { min_qty: 3, unit_price_minor: 10000 },
];
const eggs = { tiers: eggTiers, basePriceMinor: 13000 };

describe("priceOrderLine — graduated egg tiers", () => {
  const cases: Array<[number, number, number]> = [
    // quantity, expected unit_price_minor (avg), expected line_total_minor
    [1, 13000, 13000], // ₺130
    [2, 12500, 25000], // ₺250
    [3, 11667, 35000], // ₺350
    [4, 11250, 45000], // ₺450
    [5, 11000, 55000], // ₺550
    [6, 10833, 65000], // ₺650
    [10, 10500, 105000], // ₺1050
  ];
  for (const [qty, unit, total] of cases) {
    it(`${qty} pkg → unit ${unit}, total ${total}`, () => {
      expect(priceOrderLine(qty, eggs)).toEqual({
        unit_price_minor: unit,
        line_total_minor: total,
      });
    });
  }

  it("ignores tier array order", () => {
    const reversed = { ...eggs, tiers: [...eggTiers].reverse() };
    expect(priceOrderLine(5, reversed).line_total_minor).toBe(55000);
  });

  it("a redundant tier with the same rate changes nothing", () => {
    const withFour = { ...eggs, tiers: [...eggTiers, { min_qty: 4, unit_price_minor: 10000 }] };
    expect(priceOrderLine(6, withFour).line_total_minor).toBe(65000);
  });
});

describe("priceOrderLine — base price before the first tier", () => {
  it("prices units before the first tier at base", () => {
    // Units 1–4 at ₺2, the 5th onward at ₺1.
    const input = { tiers: [{ min_qty: 5, unit_price_minor: 100 }], basePriceMinor: 200 };
    expect(priceOrderLine(2, input).line_total_minor).toBe(400);
    expect(priceOrderLine(6, input).line_total_minor).toBe(1000);
  });
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
  it("tiers equal to the base keep half-kilo lines flat", () => {
    const cheese = {
      tiers: [
        { min_qty: 1, unit_price_minor: 40000 },
        { min_qty: 5, unit_price_minor: 40000 },
      ],
      basePriceMinor: 40000,
    };
    expect(priceOrderLine(0.5, cheese).line_total_minor).toBe(20000);
    expect(priceOrderLine(5.5, cheese).line_total_minor).toBe(220000);
  });
});

describe("priceOrderLine — customer override", () => {
  it("uses the flat override and ignores tiers", () => {
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
