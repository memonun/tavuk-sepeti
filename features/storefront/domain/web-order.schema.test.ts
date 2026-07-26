import { describe, expect, it } from "vitest";

import {
  webAddressSchema,
  webContactSchema,
  webOrderSchema,
} from "@/features/storefront/domain/web-order.schema";

const validContact = {
  first_name: "Ayşe",
  last_name: "Yılmaz",
  phone: "0532 123 45 67",
  email: "",
};

const validAddress = {
  city: "İstanbul",
  district: "Kadıköy",
  neighborhood: "Caferağa",
  street: "Moda Cd.",
  building_no: "12",
  apartment_no: "3",
  postal_code: "34710",
  description: "",
};

const validOrder = {
  contact: validContact,
  address: validAddress,
  scheduled_for: "2026-07-30",
  time_slot: "",
  payment_method: "cash_on_delivery",
  delivery_notes: "",
  items: [{ product_key: "eggs", quantity: 2 }],
};

describe("webContactSchema", () => {
  it("normalizes a TR phone to E.164 and blank email to null", () => {
    const parsed = webContactSchema.parse(validContact);
    expect(parsed.phone).toBe("+905321234567");
    expect(parsed.email).toBeNull();
  });

  it("rejects an invalid phone", () => {
    const res = webContactSchema.safeParse({ ...validContact, phone: "123" });
    expect(res.success).toBe(false);
  });

  it("lowercases a provided email", () => {
    const parsed = webContactSchema.parse({
      ...validContact,
      email: "Test@Example.COM",
    });
    expect(parsed.email).toBe("test@example.com");
  });
});

describe("webAddressSchema", () => {
  it("requires il / ilçe / mahalle", () => {
    expect(
      webAddressSchema.safeParse({ ...validAddress, neighborhood: "" }).success,
    ).toBe(false);
    expect(
      webAddressSchema.safeParse({ ...validAddress, city: "" }).success,
    ).toBe(false);
  });

  it("defaults optional parts to empty strings", () => {
    const parsed = webAddressSchema.parse({
      city: "İzmir",
      district: "Konak",
      neighborhood: "Alsancak",
      description: "",
    });
    expect(parsed.street).toBe("");
    expect(parsed.postal_code).toBe("");
    expect(parsed.description).toBeNull();
  });
});

describe("webOrderSchema", () => {
  it("accepts a well-formed order and nulls a blank time slot", () => {
    const parsed = webOrderSchema.parse(validOrder);
    expect(parsed.time_slot).toBeNull();
    expect(parsed.items).toHaveLength(1);
    expect(parsed.payment_method).toBe("cash_on_delivery");
  });

  it("rejects an empty basket", () => {
    const res = webOrderSchema.safeParse({ ...validOrder, items: [] });
    expect(res.success).toBe(false);
  });

  it("rejects a malformed delivery date", () => {
    const res = webOrderSchema.safeParse({
      ...validOrder,
      scheduled_for: "30-07-2026",
    });
    expect(res.success).toBe(false);
  });
});
