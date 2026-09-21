import { describe, expect, it } from "vitest";

import { estimateBasket } from "@/features/orders/application/bulk-basket-estimate";
import { emptyBatch, applyLine } from "@/features/orders/domain/draft-batch";

import type { Product } from "@/features/products/application/list-products";

const EGGS: Product = {
  key: "eggs",
  display_name: "Yumurta",
  unit: "package",
  unit_label: "paket",
  package_size: 15,
  min_qty: 1,
  step: 1,
  current_unit_price_minor: 12500, // 125 ₺ / paket
  price_tiers: [],
  active: true,
  fulfillment_type: "delivery",
  is_web_visible: true,
  is_featured: false,
  web_description: null,
  image_path: null,
  image_alt: null,
  sort_order: 0,
};
const PRODUCTS = new Map([[EGGS.key, EGGS]]);

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const batchWith = (ids: string[], qty: number) =>
  applyLine(emptyBatch("2026-09-22"), ids, { product_key: "eggs", quantity: qty });

describe("estimateBasket", () => {
  it("prices at the catalog price when nobody has a special price", () => {
    const e = estimateBasket([A], batchWith([A], 20), PRODUCTS, new Map());
    expect(e).toEqual({ subtotalMinor: 20 * 12500, orderCount: 1, specialLineCount: 0 });
  });

  it("uses a customer's special price: 20 paket × 90 ₺ = 1.800 ₺", () => {
    const overrides = new Map([[A, { eggs: 9000 }]]);
    const e = estimateBasket([A], batchWith([A], 20), PRODUCTS, overrides);
    expect(e.subtotalMinor).toBe(180_000);
    expect(e.specialLineCount).toBe(1);
  });

  it("applies the special price only to the customer who has it", () => {
    const overrides = new Map([[A, { eggs: 9000 }]]);
    const e = estimateBasket([A, B], batchWith([A, B], 20), PRODUCTS, overrides);
    expect(e.subtotalMinor).toBe(20 * 9000 + 20 * 12500);
    expect(e.orderCount).toBe(2);
    expect(e.specialLineCount).toBe(1);
  });

  it("counts only selected customers that have lines as orders", () => {
    const e = estimateBasket([A, B], batchWith([A], 5), PRODUCTS, new Map());
    expect(e.orderCount).toBe(1);
  });

  it("ignores a product that is no longer in the catalog", () => {
    const e = estimateBasket([A], batchWith([A], 5), new Map(), new Map());
    expect(e.subtotalMinor).toBe(0);
  });
});
