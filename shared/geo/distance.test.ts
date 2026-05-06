import { describe, expect, it } from "vitest";

import { haversineMeters } from "@/shared/geo/distance";

describe("haversineMeters", () => {
  it("returns 0 for identical points", () => {
    expect(haversineMeters({ lat: 41.0082, lng: 28.9784 }, { lat: 41.0082, lng: 28.9784 })).toBe(0);
  });

  it("computes ~111 km for one degree of latitude at the equator", () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    // Mean Earth radius gives 111,195 m. Tolerate ±100 m.
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_300);
  });

  it("matches the known Istanbul ↔ Ankara great-circle distance", () => {
    // Istanbul (Sultanahmet) and Ankara (Kızılay) — published GC distance
    // is ~351 km. Our result should land within 1% of that.
    const istanbul = { lat: 41.0082, lng: 28.9784 };
    const ankara = { lat: 39.9208, lng: 32.8541 };
    const d = haversineMeters(istanbul, ankara);
    expect(d).toBeGreaterThan(348_000);
    expect(d).toBeLessThan(354_000);
  });

  it("is symmetric", () => {
    const a = { lat: 38.4192, lng: 27.1287 }; // Izmir
    const b = { lat: 36.8969, lng: 30.7133 }; // Antalya
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });

  it("computes short distances accurately for routing-scale moves", () => {
    // Two points ~50m apart at Istanbul latitude. 1 degree of longitude
    // there ≈ 84km, so 0.0006° ≈ 50m.
    const a = { lat: 41.0082, lng: 28.9784 };
    const b = { lat: 41.0082, lng: 28.9784 + 0.0006 };
    const d = haversineMeters(a, b);
    expect(d).toBeGreaterThan(45);
    expect(d).toBeLessThan(55);
  });
});
