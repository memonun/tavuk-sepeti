import { describe, expect, it } from "vitest";

import { createOrderGiftSchema } from "@/features/orders/domain/order-gift";

const BASE = {
  order_id: "11111111-1111-1111-1111-111111111111",
  product_key: "kuru-kayisi",
  quantity: 50,
  unit_label: "gr",
};

describe("createOrderGiftSchema", () => {
  it("accepts a valid gift with no note", () => {
    const parsed = createOrderGiftSchema.safeParse(BASE);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.note).toBeNull();
  });

  it("treats a blank note as null", () => {
    const parsed = createOrderGiftSchema.safeParse({ ...BASE, note: "   " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.note).toBeNull();
  });

  it("keeps a real note, trimmed", () => {
    const parsed = createOrderGiftSchema.safeParse({ ...BASE, note: "  tadım için  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.note).toBe("tadım için");
  });

  it("rejects a zero or negative quantity", () => {
    expect(createOrderGiftSchema.safeParse({ ...BASE, quantity: 0 }).success).toBe(false);
    expect(createOrderGiftSchema.safeParse({ ...BASE, quantity: -5 }).success).toBe(false);
  });

  it("rejects a unit label outside the fixed set", () => {
    expect(createOrderGiftSchema.safeParse({ ...BASE, unit_label: "litre" }).success).toBe(
      false,
    );
  });

  it("coerces a numeric string quantity (form input)", () => {
    const parsed = createOrderGiftSchema.safeParse({ ...BASE, quantity: "75" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.quantity).toBe(75);
  });

  it("rejects a missing product", () => {
    expect(createOrderGiftSchema.safeParse({ ...BASE, product_key: "" }).success).toBe(false);
  });
});
