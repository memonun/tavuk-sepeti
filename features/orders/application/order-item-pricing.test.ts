import { describe, expect, it } from "vitest";

import {
  enrichOrderItems,
  isMultipleOfStep,
} from "@/features/orders/application/order-item-pricing";

import type { Product } from "@/features/products/application/list-products";

// ---- Helpers ----------------------------------------------------------------

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
    active: true,
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

const CATALOG: Product[] = [CHEESE, MILK];

// ---- isMultipleOfStep -------------------------------------------------------

describe("isMultipleOfStep", () => {
  it("returns true for exact multiples (integer step)", () => {
    expect(isMultipleOfStep(3, 1)).toBe(true);
    expect(isMultipleOfStep(4, 2)).toBe(true);
    expect(isMultipleOfStep(6, 3)).toBe(true);
  });

  it("returns true for 0.5-step multiples", () => {
    expect(isMultipleOfStep(0.5, 0.5)).toBe(true);
    expect(isMultipleOfStep(1.0, 0.5)).toBe(true);
    expect(isMultipleOfStep(1.5, 0.5)).toBe(true);
    expect(isMultipleOfStep(2.5, 0.5)).toBe(true);
  });

  it("returns false for non-multiples of 0.5", () => {
    expect(isMultipleOfStep(1.3, 0.5)).toBe(false);
    expect(isMultipleOfStep(0.7, 0.5)).toBe(false);
    expect(isMultipleOfStep(1.1, 0.5)).toBe(false);
  });

  it("returns false for non-multiples of integer step", () => {
    expect(isMultipleOfStep(3, 2)).toBe(false);
    expect(isMultipleOfStep(5, 3)).toBe(false);
  });
});

// ---- enrichOrderItems -------------------------------------------------------

describe("enrichOrderItems", () => {
  it("uses catalog price when no frozen map provided", () => {
    const result = enrichOrderItems(
      [{ product_key: "cheese", quantity: 1.5 }],
      CATALOG,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    const item = result.value[0]!;
    expect(item.unit_price_minor).toBe(CHEESE.current_unit_price_minor);
    expect(item.product_snapshot.display_name).toBe(CHEESE.display_name);
    expect(item.product_snapshot.unit).toBe(CHEESE.unit);
    expect(item.product_snapshot.unit_label).toBe(CHEESE.unit_label);
  });

  it("uses item's own unit_price_minor when supplied and no frozen map", () => {
    const result = enrichOrderItems(
      [{ product_key: "milk", quantity: 2, unit_price_minor: 4000 }],
      CATALOG,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.unit_price_minor).toBe(4000);
  });

  it("preserves frozen price + snapshot for an existing product_key", () => {
    const frozenSnapshot = { display_name: "Eski Peynir", unit: "kilogram", unit_label: "kg" };
    const frozen = new Map([
      ["cheese", { unit_price_minor: 8888, product_snapshot: frozenSnapshot }],
    ]);

    const result = enrichOrderItems(
      [{ product_key: "cheese", quantity: 1.0 }],
      CATALOG,
      frozen,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const item = result.value[0]!;
    // Frozen price wins over catalog price.
    expect(item.unit_price_minor).toBe(8888);
    expect(item.product_snapshot.display_name).toBe("Eski Peynir");
  });

  it("uses catalog price for a new product_key not in the frozen map", () => {
    // Only cheese is frozen; milk is newly added.
    const frozen = new Map([
      ["cheese", { unit_price_minor: 8888, product_snapshot: { display_name: "Eski Peynir", unit: "kilogram", unit_label: "kg" } }],
    ]);

    const result = enrichOrderItems(
      [
        { product_key: "cheese", quantity: 0.5 },
        { product_key: "milk", quantity: 2 },
      ],
      CATALOG,
      frozen,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [cheeseItem, milkItem] = result.value;
    expect(cheeseItem!.unit_price_minor).toBe(8888);       // frozen
    expect(milkItem!.unit_price_minor).toBe(MILK.current_unit_price_minor); // catalog
  });

  it("returns Err when product_key is not found in catalog", () => {
    const result = enrichOrderItems(
      [{ product_key: "nonexistent", quantity: 1 }],
      CATALOG,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/Ürün bulunamadı: nonexistent/);
  });

  it("returns Err when quantity is below min_qty", () => {
    const result = enrichOrderItems(
      [{ product_key: "cheese", quantity: 0.2 }], // cheese min_qty = 0.5
      CATALOG,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/minimum 0\.5 kg gerekli/);
  });

  it("returns Err when quantity is not a multiple of step", () => {
    const result = enrichOrderItems(
      [{ product_key: "cheese", quantity: 1.3 }], // cheese step = 0.5
      CATALOG,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/0\.5 kg katı olmalı/);
  });
});
