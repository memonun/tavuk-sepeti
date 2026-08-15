import { describe, expect, it } from "vitest";

import { parseCoordinatePair } from "@/shared/geo/parse-coordinate-pair";

describe("parseCoordinatePair", () => {
  it("parses a pair copied straight from Google Maps", () => {
    expect(parseCoordinatePair("38.35810359793086, 38.32864712115469")).toEqual({
      lat: 38.35810359793086,
      lng: 38.32864712115469,
    });
  });

  it("tolerates no space, or extra whitespace, around the comma", () => {
    expect(parseCoordinatePair("38.358,38.328")).toEqual({ lat: 38.358, lng: 38.328 });
    expect(parseCoordinatePair("  38.358  ,   38.328  ")).toEqual({
      lat: 38.358,
      lng: 38.328,
    });
  });

  it("handles negative coordinates (southern/western hemisphere)", () => {
    expect(parseCoordinatePair("-33.8688, 151.2093")).toEqual({
      lat: -33.8688,
      lng: 151.2093,
    });
  });

  it("rejects a value outside the valid lat/lng range", () => {
    expect(parseCoordinatePair("95, 38.3")).toBeNull(); // lat > 90
    expect(parseCoordinatePair("38.3, 200")).toBeNull(); // lng > 180
  });

  it("rejects anything that isn't exactly two numbers", () => {
    expect(parseCoordinatePair("38.358")).toBeNull();
    expect(parseCoordinatePair("38.358, 38.328, 12")).toBeNull();
    expect(parseCoordinatePair("Malatya, Türkiye")).toBeNull();
    expect(parseCoordinatePair("")).toBeNull();
  });
});
