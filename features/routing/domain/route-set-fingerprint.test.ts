import { describe, expect, it } from "vitest";

import {
  decideDriveFreeze,
  parseRouteSetParam,
  routeSetFingerprint,
} from "@/features/routing/domain/route-set-fingerprint";

const a = { order_id: "a", lat: 38.35, lng: 38.31 };
const b = { order_id: "b", lat: 38.32, lng: 38.27 };
const c = { order_id: "c", lat: 38.31, lng: 38.23 };

describe("routeSetFingerprint", () => {
  it("is 16 lowercase hex chars", () => {
    expect(routeSetFingerprint([a, b])).toMatch(/^[0-9a-f]{16}$/);
  });

  it("ignores input order", () => {
    expect(routeSetFingerprint([a, b, c])).toBe(routeSetFingerprint([c, a, b]));
  });

  it("changes when an order leaves the day (postponed / cancelled)", () => {
    expect(routeSetFingerprint([a, b])).not.toBe(routeSetFingerprint([a, b, c]));
  });

  it("changes when a pin moves", () => {
    expect(routeSetFingerprint([a, b])).not.toBe(
      routeSetFingerprint([a, { ...b, lat: 38.33 }]),
    );
  });

  it("ignores sub-cache-key coordinate noise", () => {
    expect(routeSetFingerprint([a])).toBe(
      routeSetFingerprint([{ ...a, lat: a.lat + 1e-9 }]),
    );
  });

  it("is stable for an empty day", () => {
    expect(routeSetFingerprint([])).toBe(routeSetFingerprint([]));
  });
});

describe("parseRouteSetParam", () => {
  it("accepts a well-formed fingerprint", () => {
    const fp = routeSetFingerprint([a]);
    expect(parseRouteSetParam(fp)).toBe(fp);
  });

  it("rejects missing or malformed input", () => {
    expect(parseRouteSetParam(undefined)).toBeNull();
    expect(parseRouteSetParam(null)).toBeNull();
    expect(parseRouteSetParam("")).toBeNull();
    expect(parseRouteSetParam("ABCDEF0123456789")).toBeNull();
    expect(parseRouteSetParam("abc")).toBeNull();
    expect(parseRouteSetParam("0123456789abcdef0")).toBeNull();
  });
});

describe("decideDriveFreeze", () => {
  const before = routeSetFingerprint([a, b, c]);
  const after = routeSetFingerprint([a, b]);

  it("freezes to the delivered-now set on first entry", () => {
    expect(
      decideDriveFreeze({
        excludeParam: undefined,
        frozenExclude: [],
        urlFingerprint: null,
        currentFingerprint: before,
        deliveredNow: ["a"],
      }),
    ).toEqual({
      kind: "redirect",
      excludeOrderIds: ["a"],
      fingerprint: before,
      refreeze: false,
    });
  });

  it("keeps a canonical URL whose stop set is unchanged (routine delivery)", () => {
    expect(
      decideDriveFreeze({
        excludeParam: "",
        frozenExclude: [],
        urlFingerprint: before,
        currentFingerprint: before,
        // Delivered since the freeze — must NOT trigger a re-freeze, or every
        // delivery would cost a Google call and reshuffle the route.
        deliveredNow: ["a", "b"],
      }),
    ).toEqual({ kind: "keep" });
  });

  it("re-freezes to everything delivered now when the stop set changed mid-drive", () => {
    // Drive started with nothing delivered; a and b were delivered; c was
    // postponed. The stale frozen set would put a and b back into the route.
    expect(
      decideDriveFreeze({
        excludeParam: "",
        frozenExclude: [],
        urlFingerprint: before,
        currentFingerprint: after,
        deliveredNow: ["a", "b"],
      }),
    ).toEqual({
      kind: "redirect",
      excludeOrderIds: ["a", "b"],
      fingerprint: after,
      refreeze: true,
    });
  });

  it("adopts the current set on a legacy URL without reshuffling", () => {
    expect(
      decideDriveFreeze({
        excludeParam: "a",
        frozenExclude: ["a"],
        urlFingerprint: null,
        currentFingerprint: before,
        deliveredNow: ["a", "b"],
      }),
    ).toEqual({
      kind: "redirect",
      excludeOrderIds: ["a"],
      fingerprint: before,
      refreeze: false,
    });
  });
});
