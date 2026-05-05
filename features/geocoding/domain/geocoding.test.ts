import { describe, expect, it } from "vitest";

import { isLowAccuracy, mapGoogleAccuracy } from "@/shared/geo/accuracy";
import { coordinateSchema, latLngSchema } from "@/shared/geo/coordinate.schema";
import { normalizeAddress } from "@/features/geocoding/domain/normalize-address";

describe("normalizeAddress", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeAddress("  Atatürk   Cad.  No: 12  ")).toBe(
      "atatürk cad. no: 12",
    );
  });

  it("uses Turkish lowercasing for İ", () => {
    // Default JS toLowerCase on "İ" yields "i̇" (i + combining dot).
    // Locale-aware tr-TR yields a clean "i".
    expect(normalizeAddress("İSTANBUL")).toBe("istanbul");
    expect(normalizeAddress("İSTANBUL")).not.toContain("̇");
  });

  it("is idempotent", () => {
    const once = normalizeAddress("Bağdat Caddesi  No 12");
    expect(normalizeAddress(once)).toBe(once);
  });
});

describe("mapGoogleAccuracy", () => {
  it("maps known Google location types", () => {
    expect(mapGoogleAccuracy("ROOFTOP")).toBe("rooftop");
    expect(mapGoogleAccuracy("RANGE_INTERPOLATED")).toBe("range_interpolated");
    expect(mapGoogleAccuracy("GEOMETRIC_CENTER")).toBe("geometric_center");
    expect(mapGoogleAccuracy("APPROXIMATE")).toBe("approximate");
  });

  it("falls through to 'unknown' for nullish or unrecognized values", () => {
    expect(mapGoogleAccuracy(null)).toBe("unknown");
    expect(mapGoogleAccuracy(undefined)).toBe("unknown");
    expect(mapGoogleAccuracy("")).toBe("unknown");
    expect(mapGoogleAccuracy("FUTURE_GOOGLE_VALUE")).toBe("unknown");
  });
});

describe("isLowAccuracy", () => {
  it("flags approximate and unknown only", () => {
    expect(isLowAccuracy("approximate")).toBe(true);
    expect(isLowAccuracy("unknown")).toBe(true);

    expect(isLowAccuracy("rooftop")).toBe(false);
    expect(isLowAccuracy("range_interpolated")).toBe(false);
    expect(isLowAccuracy("geometric_center")).toBe(false);
  });
});

describe("coordinate schemas", () => {
  it("accepts valid lat/lng", () => {
    const parsed = latLngSchema.parse({ lat: 41.0082, lng: 28.9784 });
    expect(parsed.lat).toBeCloseTo(41.0082);
  });

  it("rejects out-of-range coordinates", () => {
    expect(() => latLngSchema.parse({ lat: 91, lng: 0 })).toThrow();
    expect(() => latLngSchema.parse({ lat: 0, lng: 181 })).toThrow();
  });

  it("rejects bad source/accuracy values", () => {
    expect(() =>
      coordinateSchema.parse({
        lat: 41,
        lng: 29,
        source: "magic",
        accuracy: "rooftop",
        geocoded_at: null,
        geocoder_response_hash: null,
      }),
    ).toThrow();
  });
});
