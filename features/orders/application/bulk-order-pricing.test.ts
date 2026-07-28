import { describe, expect, it } from "vitest";

import {
  enrichBulkOrders,
  groupOverridesByCustomer,
} from "@/features/orders/application/bulk-order-pricing";

import type { Product } from "@/features/products/application/list-products";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    key: "eggs",
    display_name: "Yumurta",
    unit: "package",
    unit_label: "paket",
    package_size: 15,
    min_qty: 1,
    step: 1,
    current_unit_price_minor: 12500,
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

const EGGS = makeProduct();
const MILK = makeProduct({
  key: "milk",
  display_name: "Süt",
  unit: "liter",
  unit_label: "lt",
  package_size: 1,
  current_unit_price_minor: 5000,
});
const CHEESE = makeProduct({
  key: "cheese",
  display_name: "Peynir",
  unit: "kilogram",
  unit_label: "kg",
  package_size: 1,
  min_qty: 0.5,
  step: 0.5,
  current_unit_price_minor: 10000,
});
const CATALOG: Product[] = [EGGS, MILK, CHEESE];

describe("groupOverridesByCustomer", () => {
  it("groups flat rows into a per-customer price map", () => {
    const map = groupOverridesByCustomer([
      { customer_id: "c1", product_key: "milk", unit_price_minor: 4500 },
      { customer_id: "c1", product_key: "eggs", unit_price_minor: 12000 },
      { customer_id: "c2", product_key: "milk", unit_price_minor: 4800 },
    ]);
    expect(map.get("c1")).toEqual({ milk: 4500, eggs: 12000 });
    expect(map.get("c2")).toEqual({ milk: 4800 });
    expect(map.get("c3")).toBeUndefined();
  });
});

describe("enrichBulkOrders", () => {
  it("prices each customer from the catalog when no override exists", () => {
    const result = enrichBulkOrders(
      [{ customer_id: "c1", items: [{ product_key: "eggs", quantity: 3 }] }],
      CATALOG,
      new Map(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const order = result.value[0]!;
    expect(order.customer_id).toBe("c1");
    expect(order.items[0]!.unit_price_minor).toBe(12500);
    expect(order.items[0]!.line_total_minor).toBe(37500);
  });

  it("applies a per-customer override price over the catalog price", () => {
    const overrides = new Map<string, Record<string, number>>([
      ["c1", { milk: 4500 }],
    ]);
    const result = enrichBulkOrders(
      [{ customer_id: "c1", items: [{ product_key: "milk", quantity: 2 }] }],
      CATALOG,
      overrides,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.items[0]!.unit_price_minor).toBe(4500);
    expect(result.value[0]!.items[0]!.line_total_minor).toBe(9000);
  });

  it("rejects with a customer-tagged ValidationError on a bad step", () => {
    const result = enrichBulkOrders(
      [{ customer_id: "c9", items: [{ product_key: "cheese", quantity: 0.3 }] }],
      CATALOG,
      new Map(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("c9");
  });
});
