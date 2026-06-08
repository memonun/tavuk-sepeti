import { describe, expect, it } from "vitest";

import { partitionDeletable } from "@/features/customers/application/bulk-delete-customers";

describe("partitionDeletable", () => {
  it("blocks ids that have orders, allows the rest", () => {
    const counts = new Map([["a", 3], ["b", 0]]);
    const { blocked, deletable } = partitionDeletable(["a", "b", "c"], counts);
    expect(blocked).toEqual([{ id: "a", orderCount: 3 }]);
    expect(deletable).toEqual(["b", "c"]);
  });
});
