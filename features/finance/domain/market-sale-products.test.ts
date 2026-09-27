import { describe, expect, it } from "vitest";

import {
  buildSaleItems,
  collectSoldItems,
  displayUnit,
  formatQuantity,
  parsePriceText,
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

describe("parsePriceText", () => {
  it("blank means 'not entered yet'", () => {
    expect(parsePriceText("")).toEqual({ kind: "empty" });
    expect(parsePriceText("   ")).toEqual({ kind: "empty" });
  });

  it("accepts an amount, including 0 (given away)", () => {
    expect(parsePriceText("90")).toEqual({ kind: "ok", value: 9000 });
    expect(parsePriceText("12,50")).toEqual({ kind: "ok", value: 1250 });
    expect(parsePriceText("0")).toEqual({ kind: "ok", value: 0 });
  });

  it("rejects text that isn't an amount", () => {
    for (const bad of ["-1", "abc", "90 TL", "1,2,3"]) {
      expect(parsePriceText(bad)).toEqual({ kind: "invalid" });
    }
  });
});

describe("buildSaleItems", () => {
  const keys = ["eggs", "milk", "cheese"];

  it("keeps only rows with a quantity, priced, in sheet order", () => {
    const r = buildSaleItems(
      { cheese: "1,5", eggs: "20", milk: "" },
      { cheese: "400", eggs: "90" },
      keys,
    );
    expect(r).toEqual({
      ok: true,
      items: [
        { product_key: "eggs", quantity: 20, unit_price_minor: 9000, line_total_minor: 180_000 },
        { product_key: "cheese", quantity: 1.5, unit_price_minor: 40_000, line_total_minor: 60_000 },
      ],
    });
  });

  it("rounds the line total once (fractional totals don't drift)", () => {
    const r = buildSaleItems({ eggs: "3" }, { eggs: "33,33" }, ["eggs"]);
    expect(r).toEqual({
      ok: true,
      items: [{ product_key: "eggs", quantity: 3, unit_price_minor: 3333, line_total_minor: 9999 }],
    });
  });

  it("accepts a free giveaway (price 0) once quantity is given", () => {
    const r = buildSaleItems({ eggs: "1" }, { eggs: "0" }, ["eggs"]);
    expect(r).toEqual({
      ok: true,
      items: [{ product_key: "eggs", quantity: 1, unit_price_minor: 0, line_total_minor: 0 }],
    });
  });

  it("names the first invalid quantity", () => {
    expect(buildSaleItems({ eggs: "20", milk: "abc" }, { eggs: "90", milk: "50" }, keys)).toEqual({
      ok: false,
      productKey: "milk",
      field: "quantity",
      kind: "invalid",
    });
  });

  it("requires a price once a quantity is entered — missing", () => {
    expect(buildSaleItems({ eggs: "20" }, {}, keys)).toEqual({
      ok: false,
      productKey: "eggs",
      field: "price",
      kind: "missing",
    });
  });

  it("requires a price once a quantity is entered — invalid text", () => {
    expect(buildSaleItems({ eggs: "20" }, { eggs: "abc" }, keys)).toEqual({
      ok: false,
      productKey: "eggs",
      field: "price",
      kind: "invalid",
    });
  });

  it("ignores a price typed for a product with no quantity", () => {
    expect(buildSaleItems({}, { eggs: "90" }, keys)).toEqual({ ok: true, items: [] });
  });

  it("ignores quantities/prices for products not on the sheet", () => {
    expect(buildSaleItems({ ghost: "5" }, { ghost: "10" }, keys)).toEqual({ ok: true, items: [] });
  });
});

describe("collectSoldItems (live feedback while typing)", () => {
  it("skips a row whose quantity or price is blank/half-typed instead of erroring", () => {
    expect(
      collectSoldItems({ eggs: "20", milk: "2,", cheese: "1" }, { eggs: "90", cheese: "" }, [
        "eggs",
        "milk",
        "cheese",
      ]),
    ).toEqual([{ product_key: "eggs", quantity: 20, unit_price_minor: 9000, line_total_minor: 180_000 }]);
  });

  it("is empty when nothing is both quantified and priced", () => {
    expect(collectSoldItems({ eggs: "20" }, {}, ["eggs"])).toEqual([]);
  });
});
