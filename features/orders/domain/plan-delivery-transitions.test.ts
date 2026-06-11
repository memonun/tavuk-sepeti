import { describe, expect, it } from "vitest";

import { canTransition } from "@/features/orders/domain/order-state-machine";
import { planDeliveryTransitions } from "@/features/orders/domain/plan-delivery-transitions";

import type { OrderStatus } from "@/features/orders/domain/order";

describe("planDeliveryTransitions", () => {
  it("walks pending through confirmed to delivered", () => {
    expect(planDeliveryTransitions("pending")).toEqual(["confirmed", "delivered"]);
  });

  it("goes straight from confirmed to delivered", () => {
    expect(planDeliveryTransitions("confirmed")).toEqual(["delivered"]);
  });

  it("returns no hops when already delivered", () => {
    expect(planDeliveryTransitions("delivered")).toEqual([]);
  });

  it("returns no hops for a cancelled (terminal) order", () => {
    expect(planDeliveryTransitions("cancelled")).toEqual([]);
  });

  it("only ever returns legal consecutive transitions", () => {
    for (const from of ["pending", "confirmed"] as OrderStatus[]) {
      const hops = planDeliveryTransitions(from);
      let current = from;
      for (const next of hops) {
        expect(canTransition(current, next)).toBe(true);
        current = next;
      }
      // The plan must actually land on delivered.
      expect(current).toBe("delivered");
    }
  });
});
