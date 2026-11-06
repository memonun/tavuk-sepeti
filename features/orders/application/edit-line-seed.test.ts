import { describe, expect, it } from "vitest";

import { seedEditLines } from "@/features/orders/application/edit-line-seed";

import type { Product } from "@/features/products/application/list-products";

const EGGS = {
  key: "eggs",
  price_tiers: [
    { min_qty: 1, unit_price_minor: 13000 },
    { min_qty: 2, unit_price_minor: 12000 },
    { min_qty: 3, unit_price_minor: 10000 },
  ],
  current_unit_price_minor: 13000,
  discount_unit_price_minor: null,
} as unknown as Product;
const PRODUCTS = new Map([[EGGS.key, EGGS]]);

// 4 paket at the catalog price is ₺450 (unit ₺112,50 is only the average).
const atCatalog = { product_key: "eggs", quantity: 4, unit_price_minor: 11250, line_total_minor: 45000 };
// 4 paket at the owner's own flat ₺100.
const oneOff = { product_key: "eggs", quantity: 4, unit_price_minor: 10000, line_total_minor: 40000 };

describe("seedEditLines", () => {
  it("keeps a one-off price the order was created with — editing must not reprice it", () => {
    expect(seedEditLines([oneOff], {}, PRODUCTS)).toEqual([
      { product_key: "eggs", quantity: 4, unit_price_minor: 10000, save_for_customer: false },
    ]);
  });

  it("marks the line as saved when its price is the customer's saved price", () => {
    expect(seedEditLines([oneOff], { eggs: 10000 }, PRODUCTS)).toEqual([
      { product_key: "eggs", quantity: 4, unit_price_minor: 10000, save_for_customer: true },
    ]);
  });

  it("a one-off price wins over a different saved price", () => {
    const [line] = seedEditLines([oneOff], { eggs: 12500 }, PRODUCTS);
    expect(line?.unit_price_minor).toBe(10000);
    expect(line?.save_for_customer).toBe(false);
  });

  it("leaves a catalog-priced line unpriced when the customer has no saved price", () => {
    expect(seedEditLines([atCatalog], {}, PRODUCTS)).toEqual([
      { product_key: "eggs", quantity: 4 },
    ]);
  });

  it("starts a catalog-priced line at the saved price when the customer has one", () => {
    expect(seedEditLines([atCatalog], { eggs: 12500 }, PRODUCTS)).toEqual([
      { product_key: "eggs", quantity: 4, unit_price_minor: 12500, save_for_customer: true },
    ]);
  });

  it("never mistakes a tier average for a special price", () => {
    // 3 paket = ₺350: unit 11667 × 3 = 35001, so it does not reproduce the total.
    const tier = { product_key: "eggs", quantity: 3, unit_price_minor: 11667, line_total_minor: 35000 };
    expect(seedEditLines([tier], {}, PRODUCTS)).toEqual([{ product_key: "eggs", quantity: 3 }]);
  });

  it("keeps the order of the lines, including a repeated product", () => {
    const rows = seedEditLines([atCatalog, oneOff], {}, PRODUCTS);
    expect(rows.map((r) => r.unit_price_minor)).toEqual([undefined, 10000]);
  });

  it("does not seed a price for a product missing from the catalog", () => {
    const gone = { product_key: "old", quantity: 1, unit_price_minor: 500, line_total_minor: 500 };
    expect(seedEditLines([gone], {}, PRODUCTS)).toEqual([{ product_key: "old", quantity: 1 }]);
  });
});
