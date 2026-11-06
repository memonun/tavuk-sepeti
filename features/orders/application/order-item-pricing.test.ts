import { describe, expect, it } from "vitest";

import {
  enrichOrderItems,
  isMultipleOfStep,
  priceDeliveredOrderEdit,
} from "@/features/orders/application/order-item-pricing";
import { isEditableOrderStatus } from "@/features/orders/domain/order";

import type { Product } from "@/features/products/application/list-products";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    key: "cheese",
    display_name: "Peynir",
    web_slug: null,
    web_long_description: null,
    unit: "kilogram",
    unit_label: "kg",
    package_size: 1,
    min_qty: 0.5,
    step: 0.5,
    current_unit_price_minor: 10000,
    discount_unit_price_minor: null,
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
  current_unit_price_minor: 13000,
  // Graduated: 1st pkg ₺130, 2nd ₺120, 3rd onward ₺100.
  price_tiers: [
    { min_qty: 1, unit_price_minor: 13000 },
    { min_qty: 2, unit_price_minor: 12000 },
    { min_qty: 3, unit_price_minor: 10000 },
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

  it("applies graduated tiers — 3 egg pkg ₺350, 4 pkg ₺450", () => {
    const result = enrichOrderItems(
      [
        { product_key: "eggs", quantity: 3 },
        { product_key: "eggs", quantity: 4 },
      ],
      CATALOG,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.unit_price_minor).toBe(11667);
    expect(result.value[0]!.line_total_minor).toBe(35000);
    expect(result.value[1]!.line_total_minor).toBe(45000);
  });

  it("charges the product sale price (server re-pricing uses it)", () => {
    const onSale = makeProduct({ discount_unit_price_minor: 8000 }); // ₺100 → ₺80/kg
    const result = enrichOrderItems([{ product_key: "cheese", quantity: 1.5 }], [onSale]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.unit_price_minor).toBe(8000);
    expect(result.value[0]!.line_total_minor).toBe(12000);
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

  // The storefront reads this to decide whether the basket needs a route-grade
  // address (pin + street + daire) or a plain cargo one. The DB writers re-read
  // products.fulfillment_type inside the transaction, so this value is a UI
  // convenience — but it must still reflect the catalog faithfully.
  it("carries each product's fulfillment_type through to the enriched line", () => {
    const apricot = makeProduct({
      key: "gun-kurusu-kayisi",
      display_name: "Gün Kurusu Kayısı",
      fulfillment_type: "shipping",
    });
    const mixedCatalog = [CHEESE, apricot];

    const result = enrichOrderItems(
      [
        { product_key: "cheese", quantity: 1 },
        { product_key: "gun-kurusu-kayisi", quantity: 1 },
      ],
      mixedCatalog,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((l) => l.fulfillment_type)).toEqual([
      "delivery",
      "shipping",
    ]);
  });
});

describe("priceDeliveredOrderEdit", () => {
  // Delivered at ₺80/kg; the catalog has since moved to ₺100/kg.
  const storedCheese = {
    product_key: "cheese",
    quantity: 1,
    unit_price_minor: 8000,
    line_total_minor: 8000,
    product_snapshot: { display_name: "Peynir (eski ad)", unit: "kilogram", unit_label: "kg" },
    fulfillment_type: "delivery" as const,
  };

  it("keeps untouched lines at the delivered price and prices new ones today, in order", () => {
    const result = priceDeliveredOrderEdit(
      [
        { product_key: "milk", quantity: 1 },
        { product_key: "cheese", quantity: 1 },
      ],
      [storedCheese],
      {},
      [CHEESE, MILK],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((l) => [l.product_key, l.line_total_minor])).toEqual([
      ["milk", MILK.current_unit_price_minor],
      ["cheese", 8000],
    ]);
    expect(result.value[1]?.product_snapshot.display_name).toBe("Peynir (eski ad)");
  });

  it("re-prices a line whose quantity changed", () => {
    const result = priceDeliveredOrderEdit(
      [{ product_key: "cheese", quantity: 2 }],
      [storedCheese],
      {},
      [CHEESE],
    );
    expect(result.ok && result.value[0]?.line_total_minor).toBe(20000);
  });

  it("does not need the product in the active catalog for an untouched line", () => {
    const result = priceDeliveredOrderEdit([{ product_key: "cheese", quantity: 1 }], [storedCheese], {}, []);
    expect(result.ok && result.value[0]?.line_total_minor).toBe(8000);
  });
});

describe("isEditableOrderStatus", () => {
  it("allows pending, confirmed and delivered; not shipped or cancelled", () => {
    expect(isEditableOrderStatus("pending")).toBe(true);
    expect(isEditableOrderStatus("confirmed")).toBe(true);
    expect(isEditableOrderStatus("delivered")).toBe(true);
    expect(isEditableOrderStatus("shipped")).toBe(false);
    expect(isEditableOrderStatus("cancelled")).toBe(false);
  });
});
