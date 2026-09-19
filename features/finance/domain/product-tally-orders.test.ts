import { describe, expect, it } from "vitest";

import {
  customerNameOf,
  pageCountFor,
  parsePageParam,
  parseProductOrdersKind,
  PRODUCT_ORDERS_PAGE_SIZE,
} from "@/features/finance/domain/product-tally-orders";

describe("parseProductOrdersKind", () => {
  it("accepts only the two tabs", () => {
    expect(parseProductOrdersKind("sold")).toBe("sold");
    expect(parseProductOrdersKind("gift")).toBe("gift");
    expect(parseProductOrdersKind("all")).toBeNull();
    expect(parseProductOrdersKind(undefined)).toBeNull();
  });
});

describe("parsePageParam", () => {
  it("falls back to page 1 for anything unusable", () => {
    for (const bad of [undefined, "", "0", "-2", "1.5", "abc"]) {
      expect(parsePageParam(bad)).toBe(1);
    }
  });

  it("keeps a valid page", () => {
    expect(parsePageParam("3")).toBe(3);
  });
});

describe("pageCountFor", () => {
  it("is at least 1, even with no rows", () => {
    expect(pageCountFor(0)).toBe(1);
  });

  it("rounds up on the page size", () => {
    expect(pageCountFor(PRODUCT_ORDERS_PAGE_SIZE)).toBe(1);
    expect(pageCountFor(PRODUCT_ORDERS_PAGE_SIZE + 1)).toBe(2);
  });
});

describe("customerNameOf", () => {
  it("joins first and last name", () => {
    expect(customerNameOf({ first_name: "Ayşe", last_name: "Yılmaz" })).toBe("Ayşe Yılmaz");
  });

  it("tolerates an array embed and a blank last name", () => {
    expect(customerNameOf([{ first_name: "Ayşe", last_name: " " }])).toBe("Ayşe");
  });

  it("shows a dash when there is no customer", () => {
    expect(customerNameOf(null)).toBe("—");
  });
});
