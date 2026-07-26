import { describe, expect, it } from "vitest";

import {
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
  it("defaults optional names to empty strings", () => {
    const parsed = customerSignUpSchema.parse({
      email: "new@example.com",
      password: "supersecret",
    });
    expect(parsed.first_name).toBe("");
    expect(parsed.last_name).toBe("");
  });
});
