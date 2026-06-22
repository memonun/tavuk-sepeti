import { describe, expect, it } from "vitest";

import { parseStoredBatch, pruneUnknownProducts } from "@/features/orders/domain/draft-batch.schema";

const stored = {
  version: 1,
  scheduledFor: "2026-06-23",
  defaults: { timeSlot: "morning", paymentMethod: "cash_on_delivery", deliveryFeeMinor: 0 },
  assignments: { a: [{ product_key: "eggs", quantity: 3 }] },
};

describe("parseStoredBatch", () => {
  it("parses a valid stored batch", () => {
    const b = parseStoredBatch(stored);
    expect(b).not.toBeNull();
    expect(b!.scheduledFor).toBe("2026-06-23");
    expect(b!.assignments.a).toEqual([{ product_key: "eggs", quantity: 3 }]);
  });

  it("returns null for a stale version", () => {
    expect(parseStoredBatch({ ...stored, version: 0 })).toBeNull();
  });

  it("returns null for corrupt/missing fields", () => {
    expect(parseStoredBatch(null)).toBeNull();
    expect(parseStoredBatch({ version: 1 })).toBeNull();
    expect(parseStoredBatch({ ...stored, scheduledFor: "23-06-2026" })).toBeNull();
  });
});

describe("pruneUnknownProducts", () => {
  it("drops lines whose product no longer exists", () => {
    const batch = parseStoredBatch({
      ...stored,
      assignments: {
        a: [
          { product_key: "eggs", quantity: 3 },
          { product_key: "gone", quantity: 1 },
        ],
      },
    })!;
    const pruned = pruneUnknownProducts(batch, new Set(["eggs", "milk"]));
    expect(pruned.assignments.a).toEqual([{ product_key: "eggs", quantity: 3 }]);
  });
});
