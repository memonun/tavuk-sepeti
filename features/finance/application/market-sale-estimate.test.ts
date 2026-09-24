import { describe, expect, it } from "vitest";

import { estimateSoldItemsMinor } from "@/features/finance/application/market-sale-estimate";

import type { MarketProductOption } from "@/features/finance/domain/market-sale-products";

const EGGS: MarketProductOption = {
  key: "eggs",
  display_name: "Yumurta",
  unit_label: "paket",
  unit: "package",
  current_unit_price_minor: 12500,
  price_tiers: [],
};
const CHEESE: MarketProductOption = {
  key: "cheese",
  display_name: "Peynir",
  unit_label: "kg",
  unit: "kilogram",
  current_unit_price_minor: 40000,
  price_tiers: [{ min_qty: 3, unit_price_minor: 36000 }],
};

describe("estimateSoldItemsMinor", () => {
  it("sums catalog line totals", () => {
    expect(
      estimateSoldItemsMinor(
        [
          { product_key: "eggs", quantity: 20 },
          { product_key: "cheese", quantity: 1.5 },
        ],
        [EGGS, CHEESE],
      ),
    ).toBe(20 * 12500 + 1.5 * 40000);
  });

  it("applies volume tiers like an order does", () => {
    expect(estimateSoldItemsMinor([{ product_key: "cheese", quantity: 4 }], [CHEESE])).toBe(4 * 36000);
  });

  it("skips a product with no current price (archived)", () => {
    expect(
      estimateSoldItemsMinor(
        [
          { product_key: "eggs", quantity: 2 },
          { product_key: "gone", quantity: 5 },
        ],
        [EGGS],
      ),
    ).toBe(25000);
  });

  it("is 0 for nothing sold", () => {
    expect(estimateSoldItemsMinor([], [EGGS])).toBe(0);
  });
});
