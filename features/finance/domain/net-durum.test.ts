import { describe, expect, it } from "vitest";

import { calculateNetDurum } from "@/features/finance/domain/net-durum";

describe("calculateNetDurum", () => {
  it("is collected minus paid expenses", () => {
    expect(calculateNetDurum(100000, 40000)).toBe(60000);
  });

  it("is zero when collected exactly covers paid expenses", () => {
    expect(calculateNetDurum(50000, 50000)).toBe(0);
  });

  it("goes negative when paid expenses exceed collected money", () => {
    expect(calculateNetDurum(20000, 35000)).toBe(-15000);
  });

  it("handles a quiet period with nothing collected and nothing spent", () => {
    expect(calculateNetDurum(0, 0)).toBe(0);
  });
});
