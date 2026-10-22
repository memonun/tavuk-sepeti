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
      home_min_order_minor: 25_000,
      home_delivery_fee_minor: 5_000,
      cargo_fee_minor: 15_000,
      cargo_free_shipping_threshold_minor: 100_000,
    });

    expect(parsed.home_delivery_days).toEqual([3, 6, 0]);
  });

  // Zero delivery days would silently close the fresh-product checkout with no
  // explanation anywhere in the UI — refuse it at the boundary instead.
  it("refuses an empty day list", () => {
    const result = storefrontSettingsSchema.safeParse({
      home_delivery_days: [],
      cargo_min_order_minor: 0,
      home_min_order_minor: 0,
    });

    expect(result.success).toBe(false);
  });

  it("refuses a day outside 0..6", () => {
    expect(
      storefrontSettingsSchema.safeParse({
        home_delivery_days: [7],
        cargo_min_order_minor: 0,
        home_min_order_minor: 0,
      }).success,
    ).toBe(false);
  });

  it("refuses a negative or non-integer minimum, for either floor", () => {
    expect(
      storefrontSettingsSchema.safeParse({
        home_delivery_days: [3],
        cargo_min_order_minor: -1,
        home_min_order_minor: 0,
      }).success,
    ).toBe(false);
    expect(
      storefrontSettingsSchema.safeParse({
        home_delivery_days: [3],
        cargo_min_order_minor: 10.5,
        home_min_order_minor: 0,
      }).success,
    ).toBe(false);
    expect(
      storefrontSettingsSchema.safeParse({
        home_delivery_days: [3],
        cargo_min_order_minor: 0,
        home_min_order_minor: -1,
      }).success,
    ).toBe(false);
  });

  // The row arrives from Postgres as smallint[]/bigint; coercion keeps a
  // string-typed driver value from failing the parse.
  it("coerces the numeric shapes a DB row can arrive in", () => {
    const parsed = storefrontSettingsSchema.parse({
      home_delivery_days: ["3", "6"],
      cargo_min_order_minor: "100000",
      home_min_order_minor: "25000",
      home_delivery_fee_minor: "5000",
      cargo_fee_minor: "15000",
      cargo_free_shipping_threshold_minor: "100000",
    });

    expect(parsed.home_delivery_days).toEqual([3, 6]);
    expect(parsed.cargo_min_order_minor).toBe(100_000);
    expect(parsed.home_min_order_minor).toBe(25_000);
    expect(parsed.home_delivery_fee_minor).toBe(5_000);
    expect(parsed.cargo_fee_minor).toBe(15_000);
    expect(parsed.cargo_free_shipping_threshold_minor).toBe(100_000);
  });

  const feeRow = (fee: unknown) => ({
    home_delivery_days: [3],
    cargo_min_order_minor: 0,
    home_min_order_minor: 0,
    home_delivery_fee_minor: fee,
    cargo_fee_minor: 15_000,
    cargo_free_shipping_threshold_minor: 100_000,
  });

  it("accepts 0 as a free-delivery fee", () => {
    expect(storefrontSettingsSchema.safeParse(feeRow(0)).success).toBe(true);
  });

  it("refuses a negative, fractional or absurd delivery fee", () => {
    expect(storefrontSettingsSchema.safeParse(feeRow(-1)).success).toBe(false);
    expect(storefrontSettingsSchema.safeParse(feeRow(50.5)).success).toBe(false);
    expect(storefrontSettingsSchema.safeParse(feeRow(1_000_001)).success).toBe(false);
  });

  // A form field that never arrived must not become a silent 0 ₺ fee.
  it("refuses a missing delivery fee rather than treating it as free", () => {
    expect(storefrontSettingsSchema.safeParse(feeRow("")).success).toBe(false);
    expect(storefrontSettingsSchema.safeParse(feeRow(null)).success).toBe(false);
    expect(storefrontSettingsSchema.safeParse(feeRow(undefined)).success).toBe(false);  });

  const cargoRow = (fee: unknown, threshold: unknown) => ({
    home_delivery_days: [3],
    cargo_min_order_minor: 0,
    home_min_order_minor: 0,
    home_delivery_fee_minor: 5_000,
    cargo_fee_minor: fee,
    cargo_free_shipping_threshold_minor: threshold,
  });

  it("accepts 0 for the cargo fee and for the free-cargo threshold", () => {
    expect(storefrontSettingsSchema.safeParse(cargoRow(0, 0)).success).toBe(true);
  });

  it("refuses a negative, fractional or absurd cargo fee or threshold", () => {
    expect(storefrontSettingsSchema.safeParse(cargoRow(-1, 100_000)).success).toBe(false);
    expect(storefrontSettingsSchema.safeParse(cargoRow(150.5, 100_000)).success).toBe(false);
    expect(storefrontSettingsSchema.safeParse(cargoRow(1_000_001, 100_000)).success).toBe(false);
    expect(storefrontSettingsSchema.safeParse(cargoRow(15_000, -1)).success).toBe(false);
    expect(storefrontSettingsSchema.safeParse(cargoRow(15_000, 10_000_001)).success).toBe(false);
  });

  // Missing must not become 0: a 0 fee is free cargo, a 0 threshold drops the offer.
  it("refuses a missing cargo fee or threshold rather than treating it as 0", () => {
    for (const missing of ["", null, undefined]) {
      expect(storefrontSettingsSchema.safeParse(cargoRow(missing, 100_000)).success).toBe(false);
      expect(storefrontSettingsSchema.safeParse(cargoRow(15_000, missing)).success).toBe(false);
    }
  });
});

describe("toStorefrontSettings", () => {
  it("maps a parsed row onto the domain entity", () => {
    const settings = toStorefrontSettings(
      storefrontSettingsSchema.parse({
        home_delivery_days: [3, 6],
        cargo_min_order_minor: 100_000,
        home_min_order_minor: 25_000,
        home_delivery_fee_minor: 5_000,
        cargo_fee_minor: 15_000,
        cargo_free_shipping_threshold_minor: 100_000,
      }),
    );

    expect(settings).toEqual(DEFAULT_STOREFRONT_SETTINGS);
  });
});
