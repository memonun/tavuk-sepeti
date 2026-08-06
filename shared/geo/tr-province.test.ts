import { describe, expect, it } from "vitest";

import { isSameProvince, normalizeProvince } from "@/shared/geo/tr-province";

describe("normalizeProvince", () => {
  it("folds plain ASCII casing", () => {
    expect(normalizeProvince("MALATYA")).toBe("malatya");
    expect(normalizeProvince("Malatya")).toBe("malatya");
    expect(normalizeProvince("malatya")).toBe("malatya");
  });

  // The load-bearing cases: a naive toLowerCase() produces "i" + U+0307 for "İ"
  // and folds ASCII "I" to "i" while Turkish would give "ı". All four spellings
  // below are the same city and must collapse to one key.
  it("folds dotted and dotless i to a single canonical form", () => {
    expect(normalizeProvince("İSTANBUL")).toBe("istanbul");
    expect(normalizeProvince("ISTANBUL")).toBe("istanbul");
    expect(normalizeProvince("İstanbul")).toBe("istanbul");
    expect(normalizeProvince("ıstanbul")).toBe("istanbul");
  });

  it("does not leave a combining dot behind", () => {
    expect(normalizeProvince("İzmir")).toBe("izmir");
    expect(normalizeProvince("İzmir")).not.toContain("\u0307");
  });

  it("strips Turkish diacritics", () => {
    expect(normalizeProvince("Şanlıurfa")).toBe("sanliurfa");
    expect(normalizeProvince("Çanakkale")).toBe("canakkale");
    expect(normalizeProvince("Muğla")).toBe("mugla");
    expect(normalizeProvince("Düzce")).toBe("duzce");
    expect(normalizeProvince("Nevşehir")).toBe("nevsehir");
  });

  it("trims and collapses whitespace", () => {
    expect(normalizeProvince("  Malatya  ")).toBe("malatya");
    expect(normalizeProvince("Afyon   Karahisar")).toBe("afyon karahisar");
  });

  it("drops a trailing 'ili' suffix", () => {
    expect(normalizeProvince("Malatya İli")).toBe("malatya");
    expect(normalizeProvince("malatya ili")).toBe("malatya");
    expect(normalizeProvince("MALATYA İLİ")).toBe("malatya");
  });

  it("does not eat a province whose name merely ends in those letters", () => {
    // No space before "ili" — must not be treated as a suffix.
    expect(normalizeProvince("Bilecik")).toBe("bilecik");
    expect(normalizeProvince("Denizli")).toBe("denizli");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeProvince(null)).toBe("");
    expect(normalizeProvince(undefined)).toBe("");
    expect(normalizeProvince("")).toBe("");
    expect(normalizeProvince("   ")).toBe("");
  });
});

describe("isSameProvince", () => {
  it("matches across spelling variants", () => {
    expect(isSameProvince("MALATYA", "Malatya")).toBe(true);
    expect(isSameProvince("Malatya İli", "malatya")).toBe(true);
    expect(isSameProvince("İSTANBUL", "Istanbul")).toBe(true);
  });

  it("rejects different provinces", () => {
    expect(isSameProvince("İstanbul", "Malatya")).toBe(false);
    expect(isSameProvince("Elazığ", "Malatya")).toBe(false);
  });

  // A missing city must never satisfy a delivery-area check by accident.
  it("never matches when either side is blank", () => {
    expect(isSameProvince(null, "Malatya")).toBe(false);
    expect(isSameProvince("", "Malatya")).toBe(false);
    expect(isSameProvince("Malatya", null)).toBe(false);
    expect(isSameProvince(null, null)).toBe(false);
  });
});
