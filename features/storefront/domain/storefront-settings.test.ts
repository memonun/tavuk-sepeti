import { describe, expect, it } from "vitest";

import {
  DEFAULT_STOREFRONT_SETTINGS,
  storefrontSettingsSchema,
  toStorefrontSettings,
} from "@/features/storefront/domain/storefront-settings";

describe("storefrontSettingsSchema", () => {
  it("canonicalises the day list: de-duplicated and Monday-first", () => {
    const parsed = storefrontSettingsSchema.parse({
      home_delivery_days: [6, 3, 3, 0],
      cargo_min_order_minor: 100_000,
    });

    expect(parsed.home_delivery_days).toEqual([3, 6, 0]);
  });

  // Zero delivery days would silently close the fresh-product checkout with no
  // explanation anywhere in the UI — refuse it at the boundary instead.
  it("refuses an empty day list", () => {
    const result = storefrontSettingsSchema.safeParse({
      home_delivery_days: [],
      cargo_min_order_minor: 0,
    });

    expect(result.success).toBe(false);
  });

  it("refuses a day outside 0..6", () => {
    expect(
      storefrontSettingsSchema.safeParse({
        home_delivery_days: [7],
        cargo_min_order_minor: 0,
      }).success,
    ).toBe(false);
  });

  it("refuses a negative or non-integer minimum", () => {
    expect(
      storefrontSettingsSchema.safeParse({
        home_delivery_days: [3],
        cargo_min_order_minor: -1,
      }).success,
    ).toBe(false);
    expect(
      storefrontSettingsSchema.safeParse({
        home_delivery_days: [3],
        cargo_min_order_minor: 10.5,
      }).success,
    ).toBe(false);
  });

  // The row arrives from Postgres as smallint[]/bigint; coercion keeps a
  // string-typed driver value from failing the parse.
  it("coerces the numeric shapes a DB row can arrive in", () => {
    const parsed = storefrontSettingsSchema.parse({
      home_delivery_days: ["3", "6"],
      cargo_min_order_minor: "100000",
    });

    expect(parsed.home_delivery_days).toEqual([3, 6]);
    expect(parsed.cargo_min_order_minor).toBe(100_000);
  });
});

describe("toStorefrontSettings", () => {
  it("maps a parsed row onto the domain entity", () => {
    const settings = toStorefrontSettings(
      storefrontSettingsSchema.parse({
        home_delivery_days: [3, 6],
        cargo_min_order_minor: 100_000,
      }),
    );

    expect(settings).toEqual(DEFAULT_STOREFRONT_SETTINGS);
  });
});
