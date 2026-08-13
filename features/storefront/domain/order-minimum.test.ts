import { describe, expect, it } from "vitest";

import {
  checkOrderMinimum,
  orderMinimumMessage,
  orderMinimumNotice,
} from "@/features/storefront/domain/order-minimum";
import {
  DEFAULT_CARGO_MIN_ORDER_MINOR,
  DEFAULT_HOME_MIN_ORDER_MINOR,
} from "@/features/storefront/domain/storefront-settings";

const CARGO_MIN = DEFAULT_CARGO_MIN_ORDER_MINOR; // 1.000 ₺
const HOME_MIN = DEFAULT_HOME_MIN_ORDER_MINOR; // 250 ₺

describe("checkOrderMinimum", () => {
  it("holds a basket below the floor", () => {
    expect(checkOrderMinimum(75_000, CARGO_MIN)).toEqual({
      ok: false,
      shortfallMinor: 25_000,
    });
  });

  it("passes a basket exactly on the floor", () => {
    expect(checkOrderMinimum(CARGO_MIN, CARGO_MIN)).toEqual({
      ok: true,
      shortfallMinor: 0,
    });
  });

  it("holds a delivery-channel basket to the (lower) eve-servis floor", () => {
    expect(checkOrderMinimum(1_000, HOME_MIN)).toEqual({
      ok: false,
      shortfallMinor: 24_000,
    });
  });

  it("passes a delivery-channel basket that clears the eve-servis floor", () => {
    expect(checkOrderMinimum(HOME_MIN, HOME_MIN)).toEqual({
      ok: true,
      shortfallMinor: 0,
    });
  });

  it("treats a zero limit as no floor at all", () => {
    expect(checkOrderMinimum(1, 0)).toEqual({
      ok: true,
      shortfallMinor: 0,
    });
  });
});

describe("messages", () => {
  it("states both the limit and the gap, labeled for the channel", () => {
    const cargo = orderMinimumMessage("shipping", CARGO_MIN, 25_000);
    expect(cargo).toContain("Şehir dışı (kargo)");
    expect(cargo).toContain("1.000,00");
    expect(cargo).toContain("250,00");

    const home = orderMinimumMessage("delivery", HOME_MIN, 5_000);
    expect(home).toContain("Eve servis");
    expect(home).toContain("250,00");
    expect(home).toContain("50,00");
  });

  it("states the limit on its own for the pre-emptive notice", () => {
    expect(orderMinimumNotice("shipping", CARGO_MIN)).toContain("1.000,00");
    expect(orderMinimumNotice("delivery", HOME_MIN)).toContain("250,00");
  });
});
