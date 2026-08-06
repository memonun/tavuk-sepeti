import { describe, expect, it } from "vitest";

import { orderCellPatchSchema, orderEditSchema, orderListQuerySchema } from "@/features/orders/domain/order.schema";

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

describe("orderEditSchema", () => {
  const validPayload = {
    scheduled_for: "2026-07-01",
    time_slot: "morning",
    payment_method: "cash_on_delivery",
    delivery_notes: null,
    delivery_fee_minor: 0,
    items: [{ product_key: "cheese", quantity: 1.5 }],
  };

  it("accepts a valid edit payload without customer_id", () => {
    const r = orderEditSchema.safeParse(validPayload);
    expect(r.success).toBe(true);
  });

  it("rejects if customer_id is supplied (extra key is stripped, not an error) — customer is immutable", () => {
    // Zod strips unknown keys by default; the important thing is that
    // omitting customer_id entirely is valid (does not cause a failure).
    const withCustomer = { ...validPayload, customer_id: "11111111-1111-1111-1111-111111111111" };
    const r = orderEditSchema.safeParse(withCustomer);
    // Extra keys are stripped — still valid.
    expect(r.success).toBe(true);
    if (r.success) {
      // customer_id must not be present in the parsed output.
      expect("customer_id" in r.data).toBe(false);
    }
  });

  it("rejects empty items array", () => {
    const r = orderEditSchema.safeParse({ ...validPayload, items: [] });
    expect(r.success).toBe(false);
  });

  it("rejects missing items key", () => {
    const { items: _items, ...noItems } = validPayload;
    const r = orderEditSchema.safeParse(noItems);
    expect(r.success).toBe(false);
  });

  it("rejects invalid payment_method", () => {
    const r = orderEditSchema.safeParse({ ...validPayload, payment_method: "crypto" });
    expect(r.success).toBe(false);
  });

  // A storefront order paid by card must survive an admin edit. Before the DB
  // enum's credit_card value was mirrored here, saving any edit to such an order
  // failed validation — and the detail panel rendered it as "Havale".
  it("accepts credit_card so a card-paid web order round-trips", () => {
    const r = orderEditSchema.safeParse({
      ...validPayload,
      payment_method: "credit_card",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.payment_method).toBe("credit_card");
  });

  it("still accepts the two admin-createable methods", () => {
    for (const method of ["cash_on_delivery", "bank_transfer"] as const) {
      const r = orderEditSchema.safeParse({ ...validPayload, payment_method: method });
      expect(r.success).toBe(true);
    }
  });

  it("rejects badly-formatted scheduled_for", () => {
    const r = orderEditSchema.safeParse({ ...validPayload, scheduled_for: "01-07-2026" });
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
