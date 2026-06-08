import { describe, expect, it } from "vitest";

import { orderStatusEditor } from "@/features/orders/ui/order-status-cell";

// Regression for the grid's pre-commit validation. handleCommitEdit runs
// `editor.schema.safeParse(rawValue)` and bails before dispatching if it
// fails. The status editor commits a `{ to, reason }` object, so a bare
// enum schema would reject every transition and no status edit would ever
// reach the server. These assert the schema accepts what `edit` commits.
describe("orderStatusEditor.schema (grid pre-commit validation)", () => {
  it("accepts the {to,reason} object the editor commits (cancel)", () => {
    expect(
      orderStatusEditor.schema.safeParse({ to: "cancelled", reason: "stokta yok" })
        .success,
    ).toBe(true);
  });
  it("accepts {to, reason:null} for a non-cancel transition", () => {
    expect(
      orderStatusEditor.schema.safeParse({ to: "confirmed", reason: null }).success,
    ).toBe(true);
  });
});
