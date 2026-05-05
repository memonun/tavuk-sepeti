import { describe, expect, it } from "vitest";

import { formatDate, toIstanbulDateString } from "@/shared/utils/date";
import { formatTRY, parseTRYInput, sumMinor } from "@/shared/utils/money";
import { formatTRPhone, isE164TR, normalizeTRPhone } from "@/shared/utils/phone";

describe("money", () => {
  it("formats kuruş as TRY with comma decimal", () => {
    expect(formatTRY(4250)).toMatch(/42,50/);
    expect(formatTRY(0)).toMatch(/0,00/);
    expect(formatTRY(100)).toMatch(/1,00/);
  });

  it("parses comma-decimal input", () => {
    expect(parseTRYInput("42,50")).toBe(4250);
    expect(parseTRYInput("42.50")).toBe(4250);
    expect(parseTRYInput("100")).toBe(10000);
  });

  it("rejects garbage", () => {
    expect(parseTRYInput("")).toBeNull();
    expect(parseTRYInput("abc")).toBeNull();
    expect(parseTRYInput("42,5,0")).toBeNull();
    expect(parseTRYInput("42.500")).toBeNull(); // > 2 decimals
  });

  it("sums without float drift", () => {
    // 0.1 + 0.2 in kuruş is 10 + 20 = 30 — exact, no 0.30000000004 trap.
    expect(sumMinor([10, 20])).toBe(30);
    expect(sumMinor([])).toBe(0);
  });
});

describe("phone", () => {
  it("normalizes common TR formats to E.164", () => {
    expect(normalizeTRPhone("0532 123 45 67")).toBe("+905321234567");
    expect(normalizeTRPhone("+90 532 123 45 67")).toBe("+905321234567");
    expect(normalizeTRPhone("905321234567")).toBe("+905321234567");
    expect(normalizeTRPhone("532 123 45 67")).toBe("+905321234567");
  });

  it("rejects bad input", () => {
    expect(normalizeTRPhone("")).toBeNull();
    expect(normalizeTRPhone("abc")).toBeNull();
    expect(normalizeTRPhone("0123")).toBeNull(); // too short
    expect(normalizeTRPhone("0032 123 45 67")).toBeNull(); // leading zero subscriber
  });

  it("isE164TR validates strictly", () => {
    expect(isE164TR("+905321234567")).toBe(true);
    expect(isE164TR("+90532123456")).toBe(false); // 9 digits
    expect(isE164TR("+1 555 1234567")).toBe(false);
  });

  it("formats E.164 for display", () => {
    expect(formatTRPhone("+905321234567")).toBe("+90 532 123 45 67");
  });
});

describe("date", () => {
  it("formats UTC ISO into Istanbul-local Turkish text", () => {
    // 2026-05-05T22:00:00Z = 2026-05-06T01:00 in Europe/Istanbul (UTC+3).
    expect(formatDate("2026-05-05T22:00:00Z")).toBe("6 May 2026");
  });

  it("toIstanbulDateString clamps to local calendar day", () => {
    // Same instant as above — UTC says May 5, Istanbul says May 6.
    expect(toIstanbulDateString("2026-05-05T22:00:00Z")).toBe("2026-05-06");
  });
});
