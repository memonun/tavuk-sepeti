import { describe, expect, it } from "vitest";

import {
  addDaysIso,
  isOnOrAfter,
  isWithinWindow,
} from "@/features/storefront/domain/delivery-date";

describe("addDaysIso", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDaysIso("2026-07-26", 1)).toBe("2026-07-27");
    expect(addDaysIso("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("isOnOrAfter", () => {
  it("compares ISO dates chronologically", () => {
    expect(isOnOrAfter("2026-07-27", "2026-07-27")).toBe(true);
    expect(isOnOrAfter("2026-07-28", "2026-07-27")).toBe(true);
    expect(isOnOrAfter("2026-07-26", "2026-07-27")).toBe(false);
  });
});

describe("isWithinWindow", () => {
  it("is inclusive on both ends", () => {
    expect(isWithinWindow("2026-07-27", "2026-07-27", "2026-08-17")).toBe(true);
    expect(isWithinWindow("2026-08-17", "2026-07-27", "2026-08-17")).toBe(true);
    expect(isWithinWindow("2026-08-18", "2026-07-27", "2026-08-17")).toBe(false);
    expect(isWithinWindow("2026-07-26", "2026-07-27", "2026-08-17")).toBe(false);
  });
});
