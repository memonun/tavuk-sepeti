import { describe, expect, it } from "vitest";

import {
  filterProductsForScope,
  parseCatalogFilter,
  parseDeliveryScope,
  type ScopedProduct,
} from "@/features/storefront/domain/catalog-filter";

function product(
  key: string,
  fulfillment_type: "delivery" | "shipping",
): ScopedProduct & { key: string } {
  return { key, fulfillment_type };
}

const egg = product("yumurta", "delivery");
const apricot = product("kayisi", "shipping");

describe("parseDeliveryScope", () => {
  it("accepts the two known scopes", () => {
    expect(parseDeliveryScope("malatya")).toBe("malatya");
    expect(parseDeliveryScope("kargo")).toBe("kargo");
  });

  it("treats anything else as no scope chosen", () => {
    expect(parseDeliveryScope(undefined)).toBeNull();
    expect(parseDeliveryScope("")).toBeNull();
    expect(parseDeliveryScope("istanbul")).toBeNull();
  });
});

describe("parseCatalogFilter", () => {
  it("accepts the three known filters", () => {
    expect(parseCatalogFilter("tumu")).toBe("tumu");
    expect(parseCatalogFilter("ozel")).toBe("ozel");
    expect(parseCatalogFilter("kargo")).toBe("kargo");
  });

  it("falls back to tumu for anything unrecognized", () => {
    expect(parseCatalogFilter(undefined)).toBe("tumu");
    expect(parseCatalogFilter("garbage")).toBe("tumu");
  });
});

describe("filterProductsForScope", () => {
  const products = [egg, apricot];

  it("shows everything with no scope and the default filter", () => {
    expect(filterProductsForScope(products, null, "tumu")).toEqual(products);
  });

  it("malatya scope shows everything too, unless narrowed by filter", () => {
    expect(filterProductsForScope(products, "malatya", "tumu")).toEqual(products);
  });

  it("ozel filter keeps only delivery-fulfilled products", () => {
    expect(filterProductsForScope(products, "malatya", "ozel")).toEqual([egg]);
  });

  it("kargo filter (inside malatya scope) keeps only shipping products", () => {
    expect(filterProductsForScope(products, "malatya", "kargo")).toEqual([apricot]);
  });

  it("kargo scope always shows shipping-only, ignoring the filter param", () => {
    expect(filterProductsForScope(products, "kargo", "tumu")).toEqual([apricot]);
    expect(filterProductsForScope(products, "kargo", "ozel")).toEqual([apricot]);
  });

  it("never mutates the input array", () => {
    const copy = [...products];
    filterProductsForScope(products, null, "tumu");
    expect(products).toEqual(copy);
  });
});
