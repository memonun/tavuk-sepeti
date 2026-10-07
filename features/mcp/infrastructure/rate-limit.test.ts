import { beforeEach, describe, expect, it } from "vitest";

import {
  MAX_REQUESTS_PER_WINDOW,
  checkRateLimit,
  resetRateLimitForTests,
} from "@/features/mcp/infrastructure/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimitForTests());

  it("allows up to the limit, then blocks with a retry hint", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < MAX_REQUESTS_PER_WINDOW; i += 1) {
      expect(checkRateLimit("u1", t0 + i).allowed).toBe(true);
    }
    const blocked = checkRateLimit("u1", t0 + 1000);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks users independently and resets after the window", () => {
    const t0 = 5_000_000;
    for (let i = 0; i <= MAX_REQUESTS_PER_WINDOW; i += 1) checkRateLimit("u1", t0);
    expect(checkRateLimit("u1", t0).allowed).toBe(false);
    expect(checkRateLimit("u2", t0).allowed).toBe(true);
    expect(checkRateLimit("u1", t0 + 61_000).allowed).toBe(true);
  });
});
