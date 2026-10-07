import { describe, expect, it } from "vitest";

import { safeInternalPath } from "@/features/auth/domain/safe-redirect";

describe("safeInternalPath", () => {
  it("keeps same-site paths with query strings", () => {
    expect(safeInternalPath("/oauth/consent?authorization_id=abc", "/admin")).toBe(
      "/oauth/consent?authorization_id=abc",
    );
  });

  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "evil.com",
    "",
    "/ok\nhttps://evil.com",
    "/ok\r\n",
    "/" + "a".repeat(600),
  ])("falls back for %j", (value) => {
    expect(safeInternalPath(value, "/admin")).toBe("/admin");
  });

  it("falls back for non-strings", () => {
    expect(safeInternalPath(undefined, "/admin")).toBe("/admin");
    expect(safeInternalPath(["/a"], "/admin")).toBe("/admin");
  });
});
