import { describe, expect, it } from "vitest";

import {
  customerProfileSchema,
  customerSignUpSchema,
  passwordResetRequestSchema,
  passwordUpdateSchema,
} from "@/features/storefront/domain/customer-auth.schema";

describe("passwordResetRequestSchema", () => {
  it("lowercases and requires a valid email", () => {
    expect(passwordResetRequestSchema.parse({ email: "A@B.CO" }).email).toBe(
      "a@b.co",
    );
    expect(passwordResetRequestSchema.safeParse({ email: "nope" }).success).toBe(
      false,
    );
  });
});

describe("passwordUpdateSchema", () => {
  it("enforces a minimum length of 8", () => {
    expect(passwordUpdateSchema.safeParse({ password: "12345678" }).success).toBe(
      true,
    );
    expect(passwordUpdateSchema.safeParse({ password: "short" }).success).toBe(
      false,
    );
  });
});

describe("customerSignUpSchema", () => {
  const validSignUp = {
    email: "new@example.com",
    password: "supersecret",
    first_name: "Ayşe",
    last_name: "Yılmaz",
    phone: "0532 123 45 67",
  };

  it("normalizes a provided phone to E.164", () => {
    const parsed = customerSignUpSchema.parse(validSignUp);
    expect(parsed.phone).toBe("+905321234567");
    expect(parsed.email).toBe("new@example.com");
  });

  // Name and phone became REQUIRED when the storefront started producing route
  // orders: the driver phones the customer, and the CRM keys on the number.
  // Previously both defaulted to blank/null, which produced accounts that could
  // order but showed "Telefon eksik" on the driver's stop.
  it("requires ad and soyad", () => {
    expect(
      customerSignUpSchema.safeParse({ ...validSignUp, first_name: "" }).success,
    ).toBe(false);
    expect(
      customerSignUpSchema.safeParse({ ...validSignUp, last_name: "  " }).success,
    ).toBe(false);
  });

  it("requires a phone", () => {
    const { phone: _phone, ...noPhone } = validSignUp;
    expect(customerSignUpSchema.safeParse(noPhone).success).toBe(false);
    expect(
      customerSignUpSchema.safeParse({ ...validSignUp, phone: "" }).success,
    ).toBe(false);
    expect(
      customerSignUpSchema.safeParse({ ...validSignUp, phone: "   " }).success,
    ).toBe(false);
  });

  it("rejects an invalid phone", () => {
    expect(
      customerSignUpSchema.safeParse({ ...validSignUp, phone: "123" }).success,
    ).toBe(false);
  });
});

describe("customerProfileSchema", () => {
  it("requires name and normalizes phone", () => {
    const parsed = customerProfileSchema.parse({
      first_name: "Ali",
      last_name: "Veli",
      phone: "05321234567",
    });
    expect(parsed).toEqual({
      first_name: "Ali",
      last_name: "Veli",
      phone: "+905321234567",
    });
  });

  it("rejects a missing first name", () => {
    expect(
      customerProfileSchema.safeParse({
        first_name: "",
        last_name: "Veli",
        phone: "",
      }).success,
    ).toBe(false);
  });
});
