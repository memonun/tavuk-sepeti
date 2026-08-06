import { describe, expect, it } from "vitest";

import {
  checkoutAccountSchema,
  webOrderSchema,
} from "@/features/storefront/domain/web-order.schema";

const validOrder = {
  account: { mode: "existing" },
  address_id: "11111111-1111-1111-1111-111111111111",
  address_mode: "route",
  scheduled_for: "2026-07-30",
  time_slot: "",
  payment_method: "cash_on_delivery",
  delivery_notes: "",
  items: [{ product_key: "eggs", quantity: 2 }],
};

describe("checkoutAccountSchema", () => {
  it("accepts an already-signed-in checkout", () => {
    expect(checkoutAccountSchema.safeParse({ mode: "existing" }).success).toBe(true);
  });

  describe("signup", () => {
    const signup = {
      mode: "signup",
      email: "Ayse@Example.COM",
      password: "cokgizli1",
      first_name: "Ayşe",
      last_name: "Yılmaz",
      phone: "0532 123 45 67",
      kvkk_accepted: true,
    };

    it("normalizes the phone to E.164 and lowercases the email", () => {
      const parsed = checkoutAccountSchema.parse(signup);
      if (parsed.mode !== "signup") throw new Error("wrong branch");
      expect(parsed.phone).toBe("+905321234567");
      expect(parsed.email).toBe("ayse@example.com");
    });

    // A route stop the driver cannot phone fails at the door, and phone is the
    // field the CRM keys on — so it is required at signup, not optional.
    it("rejects a missing or malformed phone", () => {
      expect(checkoutAccountSchema.safeParse({ ...signup, phone: "" }).success).toBe(false);
      expect(checkoutAccountSchema.safeParse({ ...signup, phone: "123" }).success).toBe(false);
    });

    it("rejects a short password", () => {
      expect(checkoutAccountSchema.safeParse({ ...signup, password: "kisa" }).success).toBe(false);
    });

    it("rejects an unticked KVKK consent", () => {
      expect(checkoutAccountSchema.safeParse({ ...signup, kvkk_accepted: false }).success).toBe(false);
    });

    it("requires a name", () => {
      expect(checkoutAccountSchema.safeParse({ ...signup, first_name: "" }).success).toBe(false);
      expect(checkoutAccountSchema.safeParse({ ...signup, last_name: " " }).success).toBe(false);
    });
  });

  describe("signin", () => {
    it("accepts email + password", () => {
      const res = checkoutAccountSchema.safeParse({
        mode: "signin",
        email: "ayse@example.com",
        password: "x",
      });
      expect(res.success).toBe(true);
    });

    it("rejects a blank password", () => {
      const res = checkoutAccountSchema.safeParse({
        mode: "signin",
        email: "ayse@example.com",
        password: "",
      });
      expect(res.success).toBe(false);
    });
  });
});

describe("webOrderSchema", () => {
  it("accepts a well-formed order and nulls a blank time slot", () => {
    const parsed = webOrderSchema.parse(validOrder);
    expect(parsed.time_slot).toBeNull();
    expect(parsed.items).toHaveLength(1);
    expect(parsed.payment_method).toBe("cash_on_delivery");
    expect(parsed.address_mode).toBe("route");
  });

  // The order binds to a saved address rather than carrying a typed one, which
  // is what gives the web writer the same precondition as the admin writer.
  it("requires a real address id", () => {
    expect(webOrderSchema.safeParse({ ...validOrder, address_id: "" }).success).toBe(false);
    expect(webOrderSchema.safeParse({ ...validOrder, address_id: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects an empty basket", () => {
    expect(webOrderSchema.safeParse({ ...validOrder, items: [] }).success).toBe(false);
  });

  it("rejects a malformed delivery date", () => {
    expect(
      webOrderSchema.safeParse({ ...validOrder, scheduled_for: "30-07-2026" }).success,
    ).toBe(false);
  });

  it("accepts credit_card as a payment method", () => {
    const parsed = webOrderSchema.parse({
      ...validOrder,
      payment_method: "credit_card",
    });
    expect(parsed.payment_method).toBe("credit_card");
  });

  it("rejects an unknown address mode", () => {
    expect(
      webOrderSchema.safeParse({ ...validOrder, address_mode: "drone" }).success,
    ).toBe(false);
  });
});
