import { describe, expect, it } from "vitest";

import {
  PRODUCT_KEY_FALLBACK,
  slugifyProductKey,
} from "@/features/products/domain/product-key";

describe("slugifyProductKey", () => {
  const cases: Array<[string, string]> = [
    ["Yumurta", "yumurta"],
    ["Köy Yumurtası", "koy-yumurtasi"], // Turkish ö, ı transliterated
    ["Süt", "sut"],
    ["Beyaz Peynir", "beyaz-peynir"],
    ["Yoğurt", "yogurt"], // ğ → g
    ["İnek Sütü", "inek-sutu"], // dotted capital İ → i
    ["  Çiğ  Köfte  ", "cig-kofte"], // collapse + trim whitespace
    ["A/B & C", "a-b-c"], // punctuation → single dash
    ["Ürün 2.5", "urun-2-5"],
  ];

  for (const [input, expected] of cases) {
    it(`"${input}" → "${expected}"`, () => {
      expect(slugifyProductKey(input)).toBe(expected);
    });
  }

  it("falls back when the name has no slug-able characters", () => {
    expect(slugifyProductKey("🥚")).toBe(PRODUCT_KEY_FALLBACK);
    expect(slugifyProductKey("   ")).toBe(PRODUCT_KEY_FALLBACK);
    expect(slugifyProductKey("")).toBe(PRODUCT_KEY_FALLBACK);
  });
});
