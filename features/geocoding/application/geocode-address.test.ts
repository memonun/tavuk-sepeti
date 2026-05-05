/**
 * Geocoding orchestration tests.
 *
 * Mocks every infrastructure import so the test runs offline and
 * deterministically. The point is to assert orchestration choices — cache
 * hit short-circuits, daily limit bypasses Google, cache-write failures
 * don't fail the user request — not to retest infrastructure pieces.
 *
 * `@/shared/env` is mocked too (its real validation crashes when test env
 * doesn't have NEXT_PUBLIC_* set; the mock skips that boot dance).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GeocodingZeroResultsError } from "@/features/geocoding/domain/geocoding.errors";
import { ok, err, isOk, isErr } from "@/shared/result";

vi.mock("@/shared/env", () => ({
  env: {
    GOOGLE_MAPS_SERVER_KEY: "test-server-key",
    GEOCODING_DAILY_LIMIT: 100,
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
  },
}));

// Silence the pino logger entirely under test — its real init reads env
// fields we don't bother stubbing here.
vi.mock("@/shared/logger", () => {
  const noop = () => {
    // intentionally empty
  };
  return {
    logger: { debug: noop, info: noop, warn: noop, error: noop, fatal: noop, trace: noop, child: () => ({ debug: noop, info: noop, warn: noop, error: noop }) },
    withCorrelation: () => ({ debug: noop, info: noop, warn: noop, error: noop }),
    newCorrelationId: () => "test-correlation-id",
  };
});

vi.mock("@/features/geocoding/infrastructure/geocoding-cache.repository", () => ({
  findCacheEntry: vi.fn(),
  upsertCacheEntry: vi.fn(() => Promise.resolve(ok(undefined))),
  bumpCacheHit: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/features/geocoding/infrastructure/geocoding-api-calls.repository", () => ({
  countTodayCalls: vi.fn(),
  logApiCall: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/features/geocoding/infrastructure/google-geocoder", () => ({
  callGoogleGeocoder: vi.fn(),
}));

// Imports AFTER vi.mock so the mocks are wired before the module under test
// reads them.
const { geocodeAddress } = await import(
  "@/features/geocoding/application/geocode-address"
);
const cacheRepo = await import(
  "@/features/geocoding/infrastructure/geocoding-cache.repository"
);
const apiCallsRepo = await import(
  "@/features/geocoding/infrastructure/geocoding-api-calls.repository"
);
const geocoder = await import("@/features/geocoding/infrastructure/google-geocoder");

const mocks = {
  findCacheEntry: cacheRepo.findCacheEntry as unknown as ReturnType<typeof vi.fn>,
  upsertCacheEntry: cacheRepo.upsertCacheEntry as unknown as ReturnType<typeof vi.fn>,
  bumpCacheHit: cacheRepo.bumpCacheHit as unknown as ReturnType<typeof vi.fn>,
  countTodayCalls: apiCallsRepo.countTodayCalls as unknown as ReturnType<typeof vi.fn>,
  logApiCall: apiCallsRepo.logApiCall as unknown as ReturnType<typeof vi.fn>,
  callGoogleGeocoder: geocoder.callGoogleGeocoder as unknown as ReturnType<typeof vi.fn>,
};

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  // Sensible defaults; individual tests override.
  mocks.upsertCacheEntry.mockResolvedValue(ok(undefined));
  mocks.bumpCacheHit.mockResolvedValue(undefined);
  mocks.logApiCall.mockResolvedValue(undefined);
  mocks.countTodayCalls.mockResolvedValue(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("geocodeAddress — cache hit", () => {
  it("returns the cached coordinate without calling Google", async () => {
    mocks.findCacheEntry.mockResolvedValue(
      ok({
        inputHash: "abc",
        inputNormalized: "kadıköy",
        lat: 40.99,
        lng: 29.025,
        accuracy: "rooftop" as const,
        rawResponse: {},
        hitCount: 7,
      }),
    );

    const result = await geocodeAddress("Kadıköy");

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.lat).toBeCloseTo(40.99);
      expect(result.value.accuracy).toBe("rooftop");
      expect(result.value.source).toBe("geocoded_auto");
    }
    expect(mocks.callGoogleGeocoder).not.toHaveBeenCalled();
    expect(mocks.bumpCacheHit).toHaveBeenCalledOnce();
  });
});

describe("geocodeAddress — cache miss + Google OK", () => {
  it("calls Google, logs the call, caches the response", async () => {
    mocks.findCacheEntry.mockResolvedValue(ok(null));
    mocks.callGoogleGeocoder.mockResolvedValue({
      result: ok({
        lat: 41.0082,
        lng: 28.9784,
        accuracy: "range_interpolated",
        formattedAddress: "Sultanahmet, İstanbul",
        rawResponse: { foo: "bar" },
      }),
      responseTimeMs: 142,
      googleStatus: "OK",
    });

    const result = await geocodeAddress("Sultanahmet, İstanbul");

    expect(isOk(result)).toBe(true);
    expect(mocks.callGoogleGeocoder).toHaveBeenCalledOnce();
    expect(mocks.upsertCacheEntry).toHaveBeenCalledOnce();
    expect(mocks.logApiCall).toHaveBeenCalledWith(
      expect.objectContaining({ status: "OK", responseTimeMs: 142 }),
    );
  });
});

describe("geocodeAddress — cache miss + ZERO_RESULTS", () => {
  it("propagates the typed error and still logs the call", async () => {
    mocks.findCacheEntry.mockResolvedValue(ok(null));
    mocks.callGoogleGeocoder.mockResolvedValue({
      result: err(new GeocodingZeroResultsError({ input: "Mars" })),
      responseTimeMs: 88,
      googleStatus: "ZERO_RESULTS",
    });

    const result = await geocodeAddress("Mars");

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(GeocodingZeroResultsError);
    }
    // Logged even though it failed — quota usage is real.
    expect(mocks.logApiCall).toHaveBeenCalledOnce();
    // Cache was NOT written for an error.
    expect(mocks.upsertCacheEntry).not.toHaveBeenCalled();
  });
});

describe("geocodeAddress — daily quota", () => {
  it("refuses to call Google once the daily limit is reached", async () => {
    mocks.findCacheEntry.mockResolvedValue(ok(null));
    mocks.countTodayCalls.mockResolvedValue(100); // == limit

    const result = await geocodeAddress("İstanbul");

    expect(isErr(result)).toBe(true);
    expect(mocks.callGoogleGeocoder).not.toHaveBeenCalled();
  });

  it("calls Google when 79 of 100 used (under 80% threshold)", async () => {
    mocks.findCacheEntry.mockResolvedValue(ok(null));
    mocks.countTodayCalls.mockResolvedValue(79);
    mocks.callGoogleGeocoder.mockResolvedValue({
      result: ok({
        lat: 41,
        lng: 29,
        accuracy: "rooftop" as const,
        formattedAddress: "x",
        rawResponse: {},
      }),
      responseTimeMs: 50,
      googleStatus: "OK",
    });

    const result = await geocodeAddress("Ankara");
    expect(isOk(result)).toBe(true);
    expect(mocks.callGoogleGeocoder).toHaveBeenCalledOnce();
  });
});

describe("geocodeAddress — cache write failure", () => {
  it("still returns the coordinate when upsertCacheEntry fails (best-effort)", async () => {
    mocks.findCacheEntry.mockResolvedValue(ok(null));
    mocks.callGoogleGeocoder.mockResolvedValue({
      result: ok({
        lat: 41.0,
        lng: 29.0,
        accuracy: "rooftop" as const,
        formattedAddress: "x",
        rawResponse: {},
      }),
      responseTimeMs: 30,
      googleStatus: "OK",
    });
    mocks.upsertCacheEntry.mockResolvedValue(
      err(
        new (
          await import("@/shared/errors/app-error")
        ).ExternalApiError({ message: "DB down" }),
      ),
    );

    const result = await geocodeAddress("Beşiktaş");
    expect(isOk(result)).toBe(true);
  });
});
