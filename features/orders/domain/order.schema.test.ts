import { describe, expect, it } from "vitest";

import { orderCellPatchSchema, orderListQuerySchema } from "@/features/orders/domain/order.schema";

describe("orderCellPatchSchema", () => {
  it("accepts a scheduled_for date patch", () => {
    const r = orderCellPatchSchema.safeParse({ field: "scheduled_for", value: "2026-06-10" });
    expect(r.success).toBe(true);
  });
  it("rejects a bad date", () => {
    const r = orderCellPatchSchema.safeParse({ field: "scheduled_for", value: "10-06-2026" });
    expect(r.success).toBe(false);
  });
  it("accepts a status patch with optional reason", () => {
    const r = orderCellPatchSchema.safeParse({ field: "status", value: { to: "cancelled", reason: "stokta yok" } });
    expect(r.success).toBe(true);
  });
  it("accepts delivery_fee as a non-negative integer (kuruş)", () => {
    const r = orderCellPatchSchema.safeParse({ field: "delivery_fee", value: 1500 });
    expect(r.success).toBe(true);
  });
  it("rejects negative delivery_fee", () => {
    const r = orderCellPatchSchema.safeParse({ field: "delivery_fee", value: -1 });
    expect(r.success).toBe(false);
  });
});

describe("orderListQuerySchema (extended)", () => {
  it("defaults sort/order and accepts customer_id", () => {
    const r = orderListQuerySchema.safeParse({ customer_id: "11111111-1111-1111-1111-111111111111" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sort).toBe("scheduled_for");
      expect(r.data.order).toBe("desc");
    }
  });
});
