import { describe, expect, it } from "vitest";

import {
  isPaymentMethodAllowed,
  paymentMethodBlockedMessage,
  paymentMethodsForChannel,
} from "@/features/storefront/domain/payment-options";

describe("paymentMethodsForChannel", () => {
  it("offers cash on delivery only on a home delivery", () => {
    const delivery = paymentMethodsForChannel("delivery").map((o) => o.value);
    expect(delivery).toContain("cash_on_delivery");
  });

  // The owner's rule: a courier collects nothing on our behalf, so an
  // out-of-city parcel is prepaid or it is not placed.
  it("never offers cash on delivery on a cargo order", () => {
    const shipping = paymentMethodsForChannel("shipping").map((o) => o.value);
    expect(shipping).not.toContain("cash_on_delivery");
    expect(shipping).toEqual(["credit_card", "bank_transfer"]);
  });

  it("keeps prepaid methods available on both channels", () => {
    for (const channel of ["delivery", "shipping"] as const) {
      const values = paymentMethodsForChannel(channel).map((o) => o.value);
      expect(values).toContain("credit_card");
      expect(values).toContain("bank_transfer");
    }
  });
});

describe("isPaymentMethodAllowed", () => {
  it("mirrors the option list", () => {
    expect(isPaymentMethodAllowed("cash_on_delivery", "delivery")).toBe(true);
    expect(isPaymentMethodAllowed("cash_on_delivery", "shipping")).toBe(false);
    expect(isPaymentMethodAllowed("bank_transfer", "shipping")).toBe(true);
    expect(isPaymentMethodAllowed("credit_card", "shipping")).toBe(true);
  });
});

describe("paymentMethodBlockedMessage", () => {
  it("explains the COD restriction in the customer's terms", () => {
    expect(paymentMethodBlockedMessage("cash_on_delivery")).toMatch(
      /yalnızca eve servis/,
    );
  });
});
