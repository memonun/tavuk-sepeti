/**
 * PayTR's live merchant credentials are domain-locked to exactly
 * `https://apuhanciftligi.com` — no www, no http. These pin the boundary so
 * a regression here fails a unit test instead of a customer's checkout.
 */
import { describe, expect, it } from "vitest";

import { CANONICAL_ORIGIN, isCanonicalOrigin } from "@/shared/canonical-origin";

describe("isCanonicalOrigin", () => {
  it("accepts the exact canonical origin", () => {
    expect(isCanonicalOrigin("https://apuhanciftligi.com")).toBe(true);
    expect(isCanonicalOrigin(CANONICAL_ORIGIN)).toBe(true);
  });

  it("rejects www", () => {
    expect(isCanonicalOrigin("https://www.apuhanciftligi.com")).toBe(false);
  });

  it("rejects http", () => {
    expect(isCanonicalOrigin("http://apuhanciftligi.com")).toBe(false);
  });

  it("rejects a different domain", () => {
    expect(isCanonicalOrigin("https://example.com")).toBe(false);
  });

  it("rejects unparseable input without throwing", () => {
    expect(isCanonicalOrigin("not-a-url")).toBe(false);
    expect(isCanonicalOrigin("")).toBe(false);
  });

  it("does not special-case localhost — it's just not the canonical origin", () => {
    // Never invoked outside production (see shared/env.ts), so returning
    // false here is expected and correct, not a localhost-rejection rule.
    expect(isCanonicalOrigin("http://localhost:3000")).toBe(false);
  });
});
