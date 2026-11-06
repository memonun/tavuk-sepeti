import { describe, expect, it } from "vitest";

import { splitDeliveredEdit, type StoredLine } from "@/features/orders/domain/delivered-order-edit";

function stored(overrides: Partial<StoredLine> = {}): StoredLine {
  return {
    product_key: "egg",
    quantity: 30,
    unit_price_minor: 500,
    line_total_minor: 15000,
    product_snapshot: { display_name: "Yumurta", unit: "piece", unit_label: "adet" },
    fulfillment_type: "delivery",
    ...overrides,
  };
}

describe("splitDeliveredEdit", () => {
  it("keeps an untouched line at its stored price", () => {
    const egg = stored();
    expect(splitDeliveredEdit([{ product_key: "egg", quantity: 30 }], [egg], {})).toEqual([
      { kind: "kept", stored: egg },
    ]);
  });

  it("treats the stored price or the customer's current special as untouched", () => {
    const egg = stored();
    const fromGetOrder = splitDeliveredEdit(
      [{ product_key: "egg", quantity: 30, unit_price_minor: 500 }],
      [egg],
      {},
    );
    const fromPanelPrefill = splitDeliveredEdit(
      [{ product_key: "egg", quantity: 30, unit_price_minor: 450 }],
      [egg],
      { egg: 450 },
    );
    expect(fromGetOrder[0]?.kind).toBe("kept");
    expect(fromPanelPrefill[0]?.kind).toBe("kept");
  });

  it("re-prices a changed quantity, a typed price, and a new product", () => {
    const lines = [
      { product_key: "egg", quantity: 60 },
      { product_key: "cheese", quantity: 1, unit_price_minor: 9000 },
      { product_key: "milk", quantity: 2 },
    ];
    const result = splitDeliveredEdit(
      lines,
      [stored(), stored({ product_key: "cheese", quantity: 1, unit_price_minor: 10000 })],
      { cheese: 9500 },
    );
    expect(result.map((r) => r.kind)).toEqual(["priced", "priced", "priced"]);
  });

  it("matches each stored line at most once", () => {
    const result = splitDeliveredEdit(
      [
        { product_key: "egg", quantity: 30 },
        { product_key: "egg", quantity: 30 },
      ],
      [stored()],
      {},
    );
    expect(result.map((r) => r.kind)).toEqual(["kept", "priced"]);
  });

  it("compares fractional quantities without float drift", () => {
    const cheese = stored({ product_key: "cheese", quantity: 0.3 });
    const result = splitDeliveredEdit([{ product_key: "cheese", quantity: 0.1 + 0.2 }], [cheese], {});
    expect(result[0]?.kind).toBe("kept");
  });
});
