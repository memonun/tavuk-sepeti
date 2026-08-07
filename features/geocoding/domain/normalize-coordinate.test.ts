import { describe, expect, it } from "vitest";

import {
  COORDINATE_KEY_PRECISION,
  coordinateCacheKey,
} from "@/features/geocoding/domain/normalize-coordinate";

describe("coordinateCacheKey", () => {
  it("quantizes to the documented precision", () => {
    expect(coordinateCacheKey(38.3552123456, 38.3095987654)).toBe(
      "@38.35521,38.30960",
    );
  });

  it("pads short decimals so every key has the same shape", () => {
    expect(coordinateCacheKey(38.5, 38)).toBe("@38.50000,38.00000");
  });

  it("is stable — the same point always yields the same key", () => {
    const a = coordinateCacheKey(38.35521, 38.3096);
    const b = coordinateCacheKey(38.355209999, 38.30960001);
    expect(a).toBe(b);
  });

  it("collapses negative zero so one point cannot produce two keys", () => {
    // Without the second toFixed pass this would be "-0.00000".
    expect(coordinateCacheKey(-0.000001, -0.000001)).toBe("@0.00000,0.00000");
    expect(coordinateCacheKey(-0, 0)).toBe("@0.00000,0.00000");
  });

  it("keeps genuinely different doors on different keys", () => {
    // ~11 m apart at this latitude — must NOT share a cached building number.
    expect(coordinateCacheKey(38.3552, 38.3095)).not.toBe(
      coordinateCacheKey(38.3553, 38.3095),
    );
  });

  it("prefixes with @ so it cannot collide with a normalized address", () => {
    expect(coordinateCacheKey(1, 2).startsWith("@")).toBe(true);
  });

  it("rejects out-of-range and non-finite input", () => {
    expect(coordinateCacheKey(91, 0)).toBe("");
    expect(coordinateCacheKey(-91, 0)).toBe("");
    expect(coordinateCacheKey(0, 181)).toBe("");
    expect(coordinateCacheKey(0, -181)).toBe("");
    expect(coordinateCacheKey(Number.NaN, 0)).toBe("");
    expect(coordinateCacheKey(0, Number.POSITIVE_INFINITY)).toBe("");
  });

  it("accepts the exact range bounds", () => {
    expect(coordinateCacheKey(90, 180)).toBe("@90.00000,180.00000");
    expect(coordinateCacheKey(-90, -180)).toBe("@-90.00000,-180.00000");
  });

  it("exports the precision it actually applies", () => {
    const decimals = coordinateCacheKey(1, 2).split(",")[0]?.split(".")[1];
    expect(decimals).toHaveLength(COORDINATE_KEY_PRECISION);
  });
});
