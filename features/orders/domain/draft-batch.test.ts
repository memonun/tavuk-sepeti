import { describe, expect, it } from "vitest";

import {
  applyLine,
  clearCustomers,
  computeCoverage,
  emptyBatch,
  removeLine,
  type DraftBatch,
} from "@/features/orders/domain/draft-batch";

const base = (): DraftBatch => ({
  scheduledFor: "2026-06-23",
  defaults: { timeSlot: null, paymentMethod: "cash_on_delivery", deliveryFeeMinor: 0 },
  assignments: {
    a: [{ product_key: "eggs", quantity: 3 }, { product_key: "milk", quantity: 1 }],
    b: [{ product_key: "eggs", quantity: 3 }, { product_key: "milk", quantity: 1 }],
    c: [{ product_key: "eggs", quantity: 3 }, { product_key: "pekmez", quantity: 1 }],
  },
});

describe("emptyBatch", () => {
  it("starts with the given date and no assignments", () => {
    const b = emptyBatch("2026-06-23");
    expect(b.scheduledFor).toBe("2026-06-23");
    expect(b.assignments).toEqual({});
    expect(b.defaults.paymentMethod).toBe("cash_on_delivery");
  });
});

describe("computeCoverage", () => {
  it("returns [] for an empty selection", () => {
    expect(computeCoverage([], base())).toEqual([]);
  });

  it("marks a product all 3 share at the same qty as 'all'", () => {
    const cov = computeCoverage(["a", "b", "c"], base());
    const eggs = cov.find((l) => l.product_key === "eggs")!;
    expect(eggs.state).toBe("all");
    expect(eggs.presentCount).toBe(3);
    expect(eggs.total).toBe(3);
    expect(eggs.commonQty).toBe(3);
    expect(eggs.mixedQty).toBe(false);
  });

  it("marks the pekmez (1 of 3) as 'partial'", () => {
    const cov = computeCoverage(["a", "b", "c"], base());
    const pekmez = cov.find((l) => l.product_key === "pekmez")!;
    expect(pekmez.state).toBe("partial");
    expect(pekmez.presentCount).toBe(1);
    expect(pekmez.total).toBe(3);
  });

  it("marks milk as partial when only a,b have it", () => {
    const cov = computeCoverage(["a", "b", "c"], base());
    const milk = cov.find((l) => l.product_key === "milk")!;
    expect(milk.state).toBe("partial");
    expect(milk.presentCount).toBe(2);
  });

  it("flags mixedQty when present rows disagree on quantity", () => {
    const b = base();
    b.assignments.b = [{ product_key: "eggs", quantity: 5 }];
    b.assignments.c = [{ product_key: "eggs", quantity: 3 }];
    const cov = computeCoverage(["a", "b", "c"], b); // a:3, b:5, c:3
    const eggs = cov.find((l) => l.product_key === "eggs")!;
    expect(eggs.presentCount).toBe(3);
    expect(eggs.commonQty).toBeNull();
    expect(eggs.mixedQty).toBe(true);
  });

  it("orders lines deterministically by product_key", () => {
    const cov = computeCoverage(["a", "b", "c"], base());
    expect(cov.map((l) => l.product_key)).toEqual(["eggs", "milk", "pekmez"]);
  });
});

describe("applyLine", () => {
  it("sets a product+qty for every selected id, adding where missing", () => {
    const next = applyLine(base(), ["a", "b", "c"], { product_key: "milk", quantity: 1 });
    const cov = computeCoverage(["a", "b", "c"], next);
    const milk = cov.find((l) => l.product_key === "milk")!;
    expect(milk.state).toBe("all");
    expect(milk.commonQty).toBe(1);
  });

  it("overwrites an existing line's quantity (no duplicate)", () => {
    const next = applyLine(base(), ["a"], { product_key: "eggs", quantity: 10 });
    expect(next.assignments.a!.filter((l) => l.product_key === "eggs")).toHaveLength(1);
    expect(next.assignments.a!.find((l) => l.product_key === "eggs")!.quantity).toBe(10);
  });

  it("creates an assignment for an id not yet in the batch", () => {
    const next = applyLine(emptyBatch("2026-06-23"), ["z"], { product_key: "eggs", quantity: 2 });
    expect(next.assignments.z).toEqual([{ product_key: "eggs", quantity: 2 }]);
  });

  it("does not mutate the input batch", () => {
    const b = base();
    applyLine(b, ["a"], { product_key: "eggs", quantity: 99 });
    expect(b.assignments.a!.find((l) => l.product_key === "eggs")!.quantity).toBe(3);
  });
});

describe("removeLine", () => {
  it("removes a product from every selected id", () => {
    const next = removeLine(base(), ["a", "b", "c"], "eggs");
    const cov = computeCoverage(["a", "b", "c"], next);
    expect(cov.find((l) => l.product_key === "eggs")).toBeUndefined();
  });
});

describe("clearCustomers", () => {
  it("drops the given ids entirely from the batch", () => {
    const next = clearCustomers(base(), ["c"]);
    expect(next.assignments.c).toBeUndefined();
    expect(Object.keys(next.assignments).sort()).toEqual(["a", "b"]);
  });
});
