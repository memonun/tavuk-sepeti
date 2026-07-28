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
  it("defaults optional names to empty strings and phone to null", () => {
    const parsed = customerSignUpSchema.parse({
      email: "new@example.com",
      password: "supersecret",
    });
    expect(parsed.first_name).toBe("");
    expect(parsed.last_name).toBe("");
    expect(parsed.phone).toBeNull();
  });

  it("normalizes a provided phone to E.164 and blank to null", () => {
    const withPhone = customerSignUpSchema.parse({
      email: "a@b.co",
      password: "supersecret",
      phone: "0532 123 45 67",
    });
    expect(withPhone.phone).toBe("+905321234567");

    const blank = customerSignUpSchema.parse({
      email: "a@b.co",
      password: "supersecret",
      phone: "   ",
    });
    expect(blank.phone).toBeNull();
  });

  it("rejects an invalid phone", () => {
    expect(
      customerSignUpSchema.safeParse({
        email: "a@b.co",
        password: "supersecret",
        phone: "123",
      }).success,
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
