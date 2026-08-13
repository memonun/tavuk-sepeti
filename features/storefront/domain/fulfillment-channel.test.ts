import { describe, expect, it } from "vitest";

import {
  hasDeliveryItem,
  requiredAddressMode,
  resolveOrderChannel,
  type ChannelItem,
} from "@/features/storefront/domain/fulfillment-channel";

const eggs: ChannelItem = { product_key: "eggs", fulfillment_type: "delivery" };
const milk: ChannelItem = { product_key: "milk", fulfillment_type: "delivery" };
const apricot: ChannelItem = {
  product_key: "gun-kurusu-kayisi",
  fulfillment_type: "shipping",
};
const mulberry: ChannelItem = {
  product_key: "kuru-dut",
  fulfillment_type: "shipping",
};

describe("resolveOrderChannel", () => {
  it("is delivery for an all-fresh basket", () => {
    expect(resolveOrderChannel([eggs, milk])).toBe("delivery");
  });

  it("is shipping for an all-cargo basket", () => {
    expect(resolveOrderChannel([apricot, mulberry])).toBe("shipping");
  });

  // Owner decision: inside Malatya the cargo goods ride along in the van, so a
  // mixed basket is ONE route order rather than a split.
  it("is delivery for a mixed basket, regardless of line order", () => {
    expect(resolveOrderChannel([eggs, apricot])).toBe("delivery");
    expect(resolveOrderChannel([apricot, eggs])).toBe("delivery");
  });

  it("is shipping for an empty basket", () => {
    expect(resolveOrderChannel([])).toBe("shipping");
  });
});

describe("resolveOrderChannel — address-aware upgrade", () => {
  // Owner decision 2026-08-13: same "ride along in the van" treatment as a
  // mixed basket, triggered by the address instead of an actual fresh line.
  it("upgrades an all-cargo basket to delivery when the address is route-capable", () => {
    expect(resolveOrderChannel([apricot, mulberry], true)).toBe("delivery");
  });

  it("stays shipping for an all-cargo basket when the address is not route-capable", () => {
    expect(resolveOrderChannel([apricot, mulberry], false)).toBe("shipping");
  });

  it("a delivery-forcing basket is delivery regardless of address capability", () => {
    expect(resolveOrderChannel([eggs], false)).toBe("delivery");
    expect(resolveOrderChannel([eggs], true)).toBe("delivery");
  });

  it("defaults to cart-only behavior when address capability is omitted", () => {
    expect(resolveOrderChannel([apricot, mulberry])).toBe("shipping");
  });
});

describe("hasDeliveryItem", () => {
  it("detects a single fresh line among cargo lines", () => {
    expect(hasDeliveryItem([apricot, mulberry, milk])).toBe(true);
  });

  it("is false with no fresh lines", () => {
    expect(hasDeliveryItem([apricot, mulberry])).toBe(false);
    expect(hasDeliveryItem([])).toBe(false);
  });
});

describe("requiredAddressMode", () => {
  // Any fresh line pulls the whole basket to the strict form: pin + street +
  // bina + daire, and therefore also to the delivery province.
  it("demands the route form when anything fresh is in the basket", () => {
    expect(requiredAddressMode([eggs])).toBe("route");
    expect(requiredAddressMode([apricot, eggs])).toBe("route");
  });

  it("allows the cargo form for an all-cargo basket", () => {
    expect(requiredAddressMode([apricot, mulberry])).toBe("cargo");
  });

  it("agrees with resolveOrderChannel on every basket", () => {
    const baskets: ChannelItem[][] = [
      [],
      [eggs],
      [apricot],
      [eggs, apricot],
      [apricot, mulberry, milk],
    ];
    for (const basket of baskets) {
      const expected = resolveOrderChannel(basket) === "delivery" ? "route" : "cargo";
      expect(requiredAddressMode(basket)).toBe(expected);
    }
  });
});
