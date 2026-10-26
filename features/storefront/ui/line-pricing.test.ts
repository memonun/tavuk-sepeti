import { describe, expect, it } from "vitest";

import {
  fromPriceMinor,
  fromPriceSale,
  lineSale,
  lineTotalMinor,
} from "@/features/storefront/ui/line-pricing";

import type { Product } from "@/features/products/application/list-products";

const MILK: Product = {
  key: "milk",
  display_name: "Süt",
  web_slug: null,
  web_long_description: null,
  unit: "liter",
  unit_label: "lt",
  package_size: 1,
  min_qty: 1,
  step: 1,
  current_unit_price_minor: 4000,
  discount_unit_price_minor: 3000,
  price_tiers: [],
  active: true,
  fulfillment_type: "delivery",
  is_web_visible: true,
  is_featured: false,
  web_description: null,
  image_path: null,
  image_alt: null,
  sort_order: 0,
  total_quantity_sold: 0,
};

describe("storefront sale display", () => {
  it("charges the sale price and strikes through the regular one", () => {
    expect(lineTotalMinor(MILK, 2)).toBe(6000);
    expect(lineSale(MILK, 2)).toEqual({ regularMinor: 8000, percent: 25 });
    expect(fromPriceMinor(MILK)).toBe(3000);
    expect(fromPriceSale(MILK)).toEqual({ regularMinor: 4000, percent: 25 });
  });

  it("shows nothing struck when not on sale", () => {
    const regular = { ...MILK, discount_unit_price_minor: null };
    expect(lineTotalMinor(regular, 2)).toBe(8000);
    expect(lineSale(regular, 2)).toBeNull();
    expect(fromPriceSale(regular)).toBeNull();
  });

  it("strikes nothing on a line the volume tiers already make cheaper", () => {
    // Eggs: 1st ₺130, 2nd ₺120, 3rd on ₺100; sale ₺110.
    const eggs: Product = {
      ...MILK,
      current_unit_price_minor: 13000,
      discount_unit_price_minor: 11000,
      price_tiers: [
        { min_qty: 1, unit_price_minor: 13000 },
        { min_qty: 2, unit_price_minor: 12000 },
        { min_qty: 3, unit_price_minor: 10000 },
      ],
    };
    expect(lineSale(eggs, 1)).toEqual({ regularMinor: 13000, percent: 15 });
    expect(lineSale(eggs, 6)).toBeNull(); // 650 vs 660 → tiers win
    expect(lineTotalMinor(eggs, 6)).toBe(65000);
  });
});
