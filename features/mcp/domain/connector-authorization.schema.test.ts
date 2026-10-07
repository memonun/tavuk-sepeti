import { describe, expect, it } from "vitest";

import {
  authorizationIdSchema,
  connectorDecisionSchema,
} from "@/features/mcp/domain/connector-authorization.schema";

describe("connector authorization schemas", () => {
  it("accepts an opaque id and a known decision", () => {
    expect(
      connectorDecisionSchema.safeParse({
        authorization_id: "a1b2-C3_d4.e5",
        decision: "approve",
      }).success,
    ).toBe(true);
  });

  it.each(["", "a b", "a/b", "<script>", "x".repeat(201)])(
    "rejects authorization id %j",
    (value) => {
      expect(authorizationIdSchema.safeParse(value).success).toBe(false);
    },
  );

  it("rejects an unknown decision", () => {
    expect(
      connectorDecisionSchema.safeParse({ authorization_id: "abc", decision: "maybe" })
        .success,
    ).toBe(false);
  });
});
