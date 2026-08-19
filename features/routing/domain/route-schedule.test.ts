import { describe, expect, it } from "vitest";

import { STOP_DWELL_SECONDS, routeFinishMs, stopEtaMs } from "@/features/routing/domain/route-schedule";

const START_MS = Date.parse("2026-08-20T08:00:00.000Z");

describe("stopEtaMs", () => {
  it("adds no dwell for the first stop — nothing has been serviced yet", () => {
    const eta = stopEtaMs(START_MS, 600, 1); // 10 min driving to stop 1
    expect(eta).toBe(START_MS + 600 * 1000);
  });

  it("adds dwell for one prior stop when arriving at the second stop", () => {
    const eta = stopEtaMs(START_MS, 900, 2); // 15 min cumulative driving
    expect(eta).toBe(START_MS + 900 * 1000 + STOP_DWELL_SECONDS * 1000);
  });

  it("adds dwell for every prior stop (sequence - 1 stops)", () => {
    const eta = stopEtaMs(START_MS, 1800, 5); // 5th stop, 4 prior stops
    expect(eta).toBe(START_MS + 1800 * 1000 + 4 * STOP_DWELL_SECONDS * 1000);
  });
});

describe("routeFinishMs", () => {
  it("adds dwell for every stop, including the last one", () => {
    const finish = routeFinishMs(START_MS, 3600, 6); // 6 stops, 1 hour driving
    expect(finish).toBe(START_MS + 3600 * 1000 + 6 * STOP_DWELL_SECONDS * 1000);
  });

  it("with zero stops adds no dwell (defensive — a route always has at least one)", () => {
    const finish = routeFinishMs(START_MS, 0, 0);
    expect(finish).toBe(START_MS);
  });
});
