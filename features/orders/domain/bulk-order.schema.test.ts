import { describe, expect, it } from "vitest";

import { bulkOrderSchema } from "@/features/orders/domain/bulk-order.schema";

const valid = {
  scheduled_for: "2026-06-23",
  time_slot: "morning",
  payment_method: "cash_on_delivery",
  delivery_fee_minor: 0,
  orders: [
    {
      customer_id: "11111111-1111-1111-1111-111111111111",
      items: [{ product_key: "eggs", quantity: 3 }],
    },
  ],
};

describe("bulkOrderSchema", () => {
  it("parses a valid batch", () => {
    const parsed = bulkOrderSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("accepts null time_slot", () => {
    expect(bulkOrderSchema.safeParse({ ...valid, time_slot: null }).success).toBe(true);
  });

  it("rejects a bad date format", () => {
    expect(
      bulkOrderSchema.safeParse({ ...valid, scheduled_for: "23/06/2026" }).success,
    ).toBe(false);
  });

  it("rejects an order with zero items", () => {
    expect(
      bulkOrderSchema.safeParse({
        ...valid,
        orders: [{ customer_id: valid.orders[0]!.customer_id, items: [] }],
      }).success,
    ).toBe(false);
  });

  it("rejects more than 250 orders", () => {
    const orders = Array.from({ length: 251 }, () => ({
      customer_id: "11111111-1111-1111-1111-111111111111",
      items: [{ product_key: "eggs", quantity: 1 }],
    }));
    expect(bulkOrderSchema.safeParse({ ...valid, orders }).success).toBe(false);
  });

  it("rejects a non-positive quantity", () => {
    expect(
      bulkOrderSchema.safeParse({
        ...valid,
        orders: [
          {
            customer_id: valid.orders[0]!.customer_id,
            items: [{ product_key: "eggs", quantity: 0 }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
