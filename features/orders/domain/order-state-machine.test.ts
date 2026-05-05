import { describe, expect, it } from "vitest";

import {
  canTransition,
  isTerminal,
  transitionOrder,
} from "@/features/orders/domain/order-state-machine";

import type { Order, OrderStatus } from "@/features/orders/domain/order";

const baseOrder: Order = {
  id: "order-1",
  order_number: "ORD-2026-00001",
  customer_id: "customer-1",
  status: "pending",
  scheduled_for: "2026-05-10",
  time_slot: null,
  delivery_address_snapshot: {
    raw_text: "x",
    description: null,
    lat: 0,
    lng: 0,
    accuracy: "rooftop",
    source: "geocoded_auto",
    city: null,
    district: null,
  },
  delivery_notes: null,
  items: [],
  subtotal_minor: 0,
  delivery_fee_minor: 0,
  total_minor: 0,
  currency: "TRY",
  payment_method: "cash_on_delivery",
  payment_status: "pending",
  paid_at: null,
  recurring_template_id: null,
  source: "admin_manual",
  created_at: new Date("2026-05-05T10:00:00Z"),
  updated_at: new Date("2026-05-05T10:00:00Z"),
  created_by: "admin-1",
};

const make = (status: OrderStatus): Order => ({ ...baseOrder, status });
const actor = { id: "admin-1" };

describe("canTransition", () => {
  const allowed: Array<[OrderStatus, OrderStatus]> = [
    ["pending", "confirmed"],
    ["pending", "cancelled"],
    ["confirmed", "delivered"],
    ["confirmed", "cancelled"],
  ];
  const forbidden: Array<[OrderStatus, OrderStatus]> = [
    ["pending", "delivered"],
    ["pending", "pending"],
    ["confirmed", "pending"],
    ["confirmed", "confirmed"],
    ["delivered", "pending"],
    ["delivered", "confirmed"],
    ["delivered", "cancelled"],
    ["cancelled", "pending"],
    ["cancelled", "confirmed"],
    ["cancelled", "delivered"],
  ];

  for (const [from, to] of allowed) {
    it(`allows ${from} → ${to}`, () => {
      expect(canTransition(from, to)).toBe(true);
    });
  }
  for (const [from, to] of forbidden) {
    it(`rejects ${from} → ${to}`, () => {
      expect(canTransition(from, to)).toBe(false);
    });
  }
});

describe("isTerminal", () => {
  it("only delivered and cancelled are terminal", () => {
    expect(isTerminal("delivered")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("pending")).toBe(false);
    expect(isTerminal("confirmed")).toBe(false);
  });
});

describe("transitionOrder", () => {
  it("returns a new order with the new status (no input mutation)", () => {
    const order = make("pending");
    const result = transitionOrder(order, "confirmed", { actor });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("confirmed");
      expect(result.value).not.toBe(order); // new object
      expect(order.status).toBe("pending"); // input unchanged
    }
  });

  it("rejects forbidden transitions with rule=not_allowed", () => {
    const result = transitionOrder(make("delivered"), "pending", { actor });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_TRANSITION");
      expect((result.error.details as { rule: string }).rule).toBe("not_allowed");
    }
  });

  it("requires a non-empty reason for cancellation", () => {
    const noReason = transitionOrder(make("pending"), "cancelled", { actor });
    expect(noReason.ok).toBe(false);
    if (!noReason.ok) {
      expect((noReason.error.details as { rule: string }).rule).toBe("missing_reason");
    }

    const blankReason = transitionOrder(make("pending"), "cancelled", {
      actor,
      reason: "   ",
    });
    expect(blankReason.ok).toBe(false);

    const goodReason = transitionOrder(make("pending"), "cancelled", {
      actor,
      reason: "Müşteri iptal etti.",
    });
    expect(goodReason.ok).toBe(true);
  });

  it("does not require a reason for non-cancel transitions", () => {
    const result = transitionOrder(make("confirmed"), "delivered", { actor });
    expect(result.ok).toBe(true);
  });

  it("bumps updated_at on success", () => {
    const original = make("pending");
    const before = original.updated_at;
    const result = transitionOrder(original, "confirmed", { actor });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.updated_at.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
    }
  });
});
