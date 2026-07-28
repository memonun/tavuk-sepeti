import { describe, expect, it } from "vitest";

import {
  enrichOrderItems,
  isMultipleOfStep,
} from "@/features/orders/application/order-item-pricing";

import type { Product } from "@/features/products/application/list-products";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    key: "cheese",
    display_name: "Peynir",
    unit: "kilogram",
    unit_label: "kg",
    package_size: 1,
    min_qty: 0.5,
    step: 0.5,
    current_unit_price_minor: 10000,
    price_tiers: [],
    active: true,
    fulfillment_type: "delivery",
    is_web_visible: true,
    is_featured: false,
    web_description: null,
    image_path: null,
    image_alt: null,
    ...overrides,
  };
}

const CHEESE = makeProduct();
const MILK = makeProduct({
  key: "milk",
  display_name: "Süt",
  unit: "liter",
  unit_label: "lt",
  min_qty: 1,
  step: 1,
  current_unit_price_minor: 5000,
});
const EGGS = makeProduct({
  key: "eggs",
  display_name: "Yumurta",
  unit: "package",
  unit_label: "paket",
  min_qty: 1,
  step: 1,
  current_unit_price_minor: 12500,
  price_tiers: [
    { min_qty: 1, unit_price_minor: 12500 },
    { min_qty: 3, unit_price_minor: 11666.6667 },
    { min_qty: 4, unit_price_minor: 11250 },
  ],
});

const CATALOG: Product[] = [CHEESE, MILK, EGGS];

describe("isMultipleOfStep", () => {
  it("returns true for exact multiples", () => {
    expect(isMultipleOfStep(3, 1)).toBe(true);
    expect(isMultipleOfStep(1.5, 0.5)).toBe(true);
  });
  it("returns false for non-multiples", () => {
    expect(isMultipleOfStep(1.3, 0.5)).toBe(false);
    expect(isMultipleOfStep(3, 2)).toBe(false);
  });
});

describe("enrichOrderItems", () => {
  it("prices a flat product from its base price + snapshot", () => {
    const result = enrichOrderItems([{ product_key: "cheese", quantity: 1.5 }], CATALOG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const item = result.value[0]!;
    expect(item.unit_price_minor).toBe(10000);
    expect(item.line_total_minor).toBe(15000);
    expect(item.product_snapshot.display_name).toBe("Peynir");
  });

  it("applies volume tiers — 3 egg pkg is exactly ₺350.00", () => {
    const result = enrichOrderItems([{ product_key: "eggs", quantity: 3 }], CATALOG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.unit_price_minor).toBe(11667);
    expect(result.value[0]!.line_total_minor).toBe(35000);
  });

  it("uses an explicit special price (flat, ignores tiers)", () => {
    const result = enrichOrderItems(
      [{ product_key: "eggs", quantity: 4, unit_price_minor: 11000 }],
      CATALOG,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.unit_price_minor).toBe(11000);
    expect(result.value[0]!.line_total_minor).toBe(44000);
  });

  it("prices a flat product from the catalog", () => {
    const result = enrichOrderItems([{ product_key: "milk", quantity: 2 }], CATALOG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.unit_price_minor).toBe(5000);
    expect(result.value[0]!.line_total_minor).toBe(10000);
  });

  it("returns Err when product_key is not found", () => {
    const result = enrichOrderItems([{ product_key: "nope", quantity: 1 }], CATALOG);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/Ürün bulunamadı: nope/);
  });

  it("returns Err below min_qty", () => {
    const result = enrichOrderItems([{ product_key: "cheese", quantity: 0.2 }], CATALOG);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/minimum 0\.5 kg gerekli/);
  });

  it("returns Err when not a step multiple", () => {
    const result = enrichOrderItems([{ product_key: "cheese", quantity: 1.3 }], CATALOG);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/0\.5 kg katı olmalı/);
  });
});
