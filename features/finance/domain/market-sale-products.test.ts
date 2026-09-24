import { describe, expect, it } from "vitest";

import {
  buildSaleItems,
  collectSoldItems,
  displayUnit,
  formatQuantity,
  parseQuantityText,
  summarizeSoldLines,
} from "@/features/finance/domain/market-sale-products";

describe("displayUnit", () => {
  it("shows the product's own label", () => {
    expect(displayUnit("paket (15 adet)", "package")).toBe("paket (15 adet)");
    expect(displayUnit("kg", "kilogram")).toBe("kg");
  });

  it("falls back to the unit enum when the label is blank or just a number", () => {
    expect(displayUnit("1", "kilogram")).toBe("kg");
    expect(displayUnit("", "liter")).toBe("lt");
    expect(displayUnit(" 0,5 ", "kilogram")).toBe("kg");
    expect(displayUnit("", "piece")).toBe("adet");
  });
});

describe("formatQuantity", () => {
  it("uses the Turkish decimal comma and at most two decimals", () => {
    expect(formatQuantity(20)).toBe("20");
    expect(formatQuantity(2.5)).toBe("2,5");
    expect(formatQuantity(0.125)).toBe("0,13");
    expect(formatQuantity(1200)).toBe("1.200");
  });
});

describe("summarizeSoldLines", () => {
  it("joins name, quantity and unit", () => {
    expect(
      summarizeSoldLines([
        { product_name: "Yumurta", quantity: 20, unit_label: "paket", unit: "package" },
        { product_name: "Peynir", quantity: 1.5, unit_label: "1", unit: "kilogram" },
      ]),
    ).toBe("Yumurta 20 paket · Peynir 1,5 kg");
  });

  it("is empty for no lines", () => {
    expect(summarizeSoldLines([])).toBe("");
  });
});

describe("parseQuantityText", () => {
  it("blank is 'not sold'", () => {
    expect(parseQuantityText("")).toEqual({ kind: "empty" });
    expect(parseQuantityText("   ")).toEqual({ kind: "empty" });
  });

  it("accepts positive numbers with comma or dot", () => {
    expect(parseQuantityText("20")).toEqual({ kind: "ok", value: 20 });
    expect(parseQuantityText("2,5")).toEqual({ kind: "ok", value: 2.5 });
    expect(parseQuantityText(" 0.5 ")).toEqual({ kind: "ok", value: 0.5 });
  });

  it("rejects zero, negatives and text", () => {
    for (const bad of ["0", "0,0", "-1", "abc", "2 paket", "1,2,3", "."]) {
      expect(parseQuantityText(bad)).toEqual({ kind: "invalid" });
    }
  });
});

describe("buildSaleItems", () => {
  const keys = ["eggs", "milk", "cheese"];

  it("keeps only the filled boxes, in sheet order", () => {
    const r = buildSaleItems({ cheese: "1,5", eggs: "20", milk: "" }, keys);
    expect(r).toEqual({
      ok: true,
      items: [
        { product_key: "eggs", quantity: 20 },
        { product_key: "cheese", quantity: 1.5 },
      ],
    });
  });

  it("names the first invalid box instead of guessing", () => {
    expect(buildSaleItems({ eggs: "20", milk: "abc", cheese: "0" }, keys)).toEqual({
      ok: false,
      productKey: "milk",
    });
  });

  it("ignores quantities for products that are not on the sheet", () => {
    expect(buildSaleItems({ ghost: "5" }, keys)).toEqual({ ok: true, items: [] });
  });
});

describe("collectSoldItems (live feedback while typing)", () => {
  it("skips blank and half-typed boxes instead of discarding everything", () => {
    expect(collectSoldItems({ eggs: "20", milk: "2,", cheese: "" }, ["eggs", "milk", "cheese"])).toEqual([
      { product_key: "eggs", quantity: 20 },
    ]);
  });
});
