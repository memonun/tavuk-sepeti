import { describe, expect, it } from "vitest";
import { formatRecipeMinutes } from "./recipe-duration";

describe("formatRecipeMinutes", () => {
  it.each([
    [0, "0 dk"],
    [45, "45 dk"],
    [60, "1 sa"],
    [90, "1 sa 30 dk"],
    [600, "10 sa"],
  ] as const)("formats %s minutes as %s", (minutes, expected) => {
    expect(formatRecipeMinutes(minutes)).toBe(expected);
  });
});
