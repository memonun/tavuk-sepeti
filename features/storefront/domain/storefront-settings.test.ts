import { describe, expect, it } from "vitest";

import {
  DEFAULT_HERO_SUBTITLE,
  DEFAULT_HERO_TITLE,
  DEFAULT_STOREFRONT_SETTINGS,
  storefrontSettingsSchema,
  toStorefrontSettings,
} from "@/features/storefront/domain/storefront-settings";

const HERO = { hero_title: DEFAULT_HERO_TITLE, hero_subtitle: DEFAULT_HERO_SUBTITLE };

describe("storefrontSettingsSchema", () => {
  it("canonicalises the day list: de-duplicated and Monday-first", () => {
    const parsed = storefrontSettingsSchema.parse({
      home_delivery_days: [6, 3, 3, 0],
      cargo_min_order_minor: 100_000,
      home_min_order_minor: 25_000,
      home_delivery_fee_minor: 5_000,
      cargo_fee_minor: 15_000,
      cargo_free_shipping_threshold_minor: 100_000,
      ...HERO,
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
      ...HERO,
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
    ...HERO,
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
    ...HERO,
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

  const heroRow = (title: unknown, subtitle: unknown) => ({
    home_delivery_days: [3],
    cargo_min_order_minor: 0,
    home_min_order_minor: 0,
    home_delivery_fee_minor: 5_000,
    cargo_fee_minor: 15_000,
    cargo_free_shipping_threshold_minor: 100_000,
    hero_title: title,
    hero_subtitle: subtitle,
  });

  it("trims the home page text", () => {
    const parsed = storefrontSettingsSchema.parse(heroRow("  Yeni başlık  ", " Yeni cümle. "));
    expect(parsed.hero_title).toBe("Yeni başlık");
    expect(parsed.hero_subtitle).toBe("Yeni cümle.");
  });

  // A blank or missing heading would leave the home page with no title.
  it("refuses blank, missing or too-long home page text", () => {
    for (const bad of ["", "   ", null, undefined, "x".repeat(81)]) {
      expect(storefrontSettingsSchema.safeParse(heroRow(bad, "Cümle.")).success).toBe(false);
    }
    for (const bad of ["", "   ", null, undefined, "x".repeat(141)]) {
      expect(storefrontSettingsSchema.safeParse(heroRow("Başlık", bad)).success).toBe(false);
    }
    expect(
      storefrontSettingsSchema.safeParse(heroRow("x".repeat(80), "x".repeat(140))).success,
    ).toBe(true);
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
        ...HERO,
      }),
    );

    expect(settings).toEqual(DEFAULT_STOREFRONT_SETTINGS);
  });
});
