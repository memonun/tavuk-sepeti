import { describe, expect, it } from "vitest";

import {
  buildComputeRoutesBody,
  computeRoutesResponseSchema,
  mapComputeRoutesResponse,
  parseDurationSeconds,
} from "@/features/routing/infrastructure/google-directions.mapper";

describe("buildComputeRoutesBody", () => {
  it("requests waypoint optimization for intermediate stops", () => {
    const body = buildComputeRoutesBody({
      origin: { lat: 41, lng: 29 },
      destination: { lat: 41, lng: 29 },
      waypoints: [
        { lat: 41.1, lng: 29.1 },
        { lat: 41.2, lng: 29.2 },
      ],
    });

    expect(body.optimizeWaypointOrder).toBe(true);
    expect(body.intermediates).toHaveLength(2);
    expect(body.travelMode).toBe("DRIVE");
  });

  it("omits intermediates + optimization for a direct origin → destination route", () => {
    const body = buildComputeRoutesBody({
      origin: { lat: 41, lng: 29 },
      destination: { lat: 41.5, lng: 29.5 },
      waypoints: [],
    });

    expect(body.intermediates).toBeUndefined();
    expect(body.optimizeWaypointOrder).toBeUndefined();
  });
});

describe("parseDurationSeconds", () => {
  it("parses protobuf Duration strings to whole seconds", () => {
    expect(parseDurationSeconds("75s")).toBe(75);
    expect(parseDurationSeconds("75.4s")).toBe(75);
  });

  it("treats an omitted (zero) duration as 0", () => {
    expect(parseDurationSeconds(undefined)).toBe(0);
  });
});

describe("mapComputeRoutesResponse", () => {
  it("maps the optimized order, polylines, and legs; zero-valued fields default to 0", () => {
    const sample = {
      routes: [
        {
          optimizedIntermediateWaypointIndex: [1, 0],
          polyline: { encodedPolyline: "overview" },
          legs: [
            {
              distanceMeters: 1000,
              duration: "120s",
              steps: [
                { polyline: { encodedPolyline: "a" } },
                { polyline: { encodedPolyline: "b" } },
              ],
            },
            // distanceMeters omitted by proto3 (== 0)
            { duration: "60s", steps: [{ polyline: { encodedPolyline: "c" } }] },
            // duration omitted (== 0); no steps
            { distanceMeters: 500, steps: [] },
          ],
        },
      ],
    };

    const parsed = computeRoutesResponseSchema.safeParse(sample);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const result = mapComputeRoutesResponse(parsed.data);
    if (!result) throw new Error("expected a mapped result");

    expect(result.waypointOrder).toEqual([1, 0]);
    expect(result.overviewPolyline).toBe("overview");
    expect(result.stepPolylines).toEqual(["a", "b", "c"]);
    expect(result.legs).toEqual([
      { distanceM: 1000, durationS: 120 },
      { distanceM: 0, durationS: 60 },
      { distanceM: 500, durationS: 0 },
    ]);
  });

  it("defaults the optimized order to empty for a no-waypoint route", () => {
    const parsed = computeRoutesResponseSchema.safeParse({
      routes: [{ polyline: { encodedPolyline: "p" }, legs: [] }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const result = mapComputeRoutesResponse(parsed.data);
    if (!result) throw new Error("expected a mapped result");
    expect(result.waypointOrder).toEqual([]);
  });

  it("returns null when the API yields zero routes", () => {
    const parsed = computeRoutesResponseSchema.safeParse({ routes: [] });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(mapComputeRoutesResponse(parsed.data)).toBeNull();
  });
});
