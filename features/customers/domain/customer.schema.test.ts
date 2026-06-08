import { describe, expect, it } from "vitest";

import {
  customerCellPatchSchema,
  customerFormSchema,
} from "@/features/customers/domain/customer.schema";

describe("customerFormSchema (relaxed)", () => {
  it("accepts a blank-ish customer with no name and no address", () => {
    const parsed = customerFormSchema.safeParse({ status: "active" });
    expect(parsed.success).toBe(true);
  });
});

describe("customerCellPatchSchema (relaxed names)", () => {
  it("accepts clearing first_name to null", () => {
    const parsed = customerCellPatchSchema.safeParse({ field: "first_name", value: "" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.value).toBeNull();
  });
});
