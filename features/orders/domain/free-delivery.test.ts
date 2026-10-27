import { describe, expect, it } from "vitest";

import {
  applyFreeEggDelivery,
  eggPackageCount,
  qualifiesForFreeEggDelivery,
  type FreeDeliveryLine,
} from "@/features/orders/domain/free-delivery";

const eggs = (quantity: number): FreeDeliveryLine => ({
  product_key: "eggs",
  quantity,
  fulfillment_type: "delivery",
});
const milk = (quantity: number): FreeDeliveryLine => ({
  product_key: "milk",
  quantity,
  fulfillment_type: "delivery",
});
const apricot = (quantity: number): FreeDeliveryLine => ({
  product_key: "gun-kurusu-kayisi",
  quantity,
  fulfillment_type: "shipping",
});

describe("eggPackageCount", () => {
  it("sums only egg lines", () => {
    expect(eggPackageCount([eggs(4), milk(20), eggs(3)])).toBe(7);
  });
  it("is 0 without eggs", () => {
    expect(eggPackageCount([milk(5)])).toBe(0);
    expect(eggPackageCount([])).toBe(0);
  });
});

describe("qualifiesForFreeEggDelivery", () => {
  it("does not qualify at 9 packages", () => {
    expect(qualifiesForFreeEggDelivery([eggs(9)])).toBe(false);
  });
  it("qualifies at exactly 10 packages (inclusive)", () => {
    expect(qualifiesForFreeEggDelivery([eggs(10)])).toBe(true);
  });
  it("qualifies above 10 packages", () => {
    expect(qualifiesForFreeEggDelivery([eggs(64)])).toBe(true);
  });
  it("counts eggs split over several lines", () => {
    expect(qualifiesForFreeEggDelivery([eggs(6), eggs(4)])).toBe(true);
  });
  it("ignores other products — 10 of something else is not enough", () => {
    expect(qualifiesForFreeEggDelivery([milk(10)])).toBe(false);
    expect(qualifiesForFreeEggDelivery([eggs(5), milk(10)])).toBe(false);
  });
  it("still qualifies when other hand-delivered products ride along", () => {
    expect(qualifiesForFreeEggDelivery([eggs(10), milk(2)])).toBe(true);
  });
  it("never qualifies when any line ships by cargo", () => {
    expect(qualifiesForFreeEggDelivery([eggs(10), apricot(1)])).toBe(false);
  });
  it("does not qualify an empty basket", () => {
    expect(qualifiesForFreeEggDelivery([])).toBe(false);
  });
});

describe("applyFreeEggDelivery", () => {
  it("zeroes the fee for a qualifying basket", () => {
    expect(applyFreeEggDelivery(5000, [eggs(10)])).toBe(0);
  });
  it("keeps the fee as given below the threshold", () => {
    expect(applyFreeEggDelivery(5000, [eggs(9)])).toBe(5000);
  });
  it("keeps a cargo order's fee", () => {
    expect(applyFreeEggDelivery(5000, [eggs(10), apricot(2)])).toBe(5000);
  });
  it("leaves an already-zero fee at zero", () => {
    expect(applyFreeEggDelivery(0, [eggs(1)])).toBe(0);
  });
});
