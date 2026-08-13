import { describe, expect, it } from "vitest";

import {
  checkOrderMinimum,
  orderMinimumMessage,
  orderMinimumNotice,
} from "@/features/storefront/domain/order-minimum";
import { DEFAULT_CARGO_MIN_ORDER_MINOR } from "@/features/storefront/domain/storefront-settings";

const MIN = DEFAULT_CARGO_MIN_ORDER_MINOR; // 1.000 ₺

describe("checkOrderMinimum", () => {
  it("holds a cargo basket to the floor", () => {
    expect(checkOrderMinimum("shipping", 75_000, MIN)).toEqual({
      ok: false,
      shortfallMinor: 25_000,
    });
  });

  it("passes a cargo basket exactly on the floor", () => {
    expect(checkOrderMinimum("shipping", MIN, MIN)).toEqual({
      ok: true,
      shortfallMinor: 0,
    });
  });

  // A basket with any fresh line is one delivery order — the cargo-able goods
  // ride along in the van, so no shipping cost and no floor.
  it("never holds a home-delivery basket to the cargo floor", () => {
    expect(checkOrderMinimum("delivery", 1_000, MIN)).toEqual({
      ok: true,
      shortfallMinor: 0,
    });
  });

  it("treats a zero limit as no floor at all", () => {
    expect(checkOrderMinimum("shipping", 1, 0)).toEqual({
      ok: true,
      shortfallMinor: 0,
    });
  });
});

describe("messages", () => {
  it("states both the limit and the gap", () => {
    const message = orderMinimumMessage(MIN, 25_000);
    expect(message).toContain("1.000,00");
    expect(message).toContain("250,00");
  });

  it("states the limit on its own for the pre-emptive notice", () => {
    expect(orderMinimumNotice(MIN)).toContain("1.000,00");
  });
});
