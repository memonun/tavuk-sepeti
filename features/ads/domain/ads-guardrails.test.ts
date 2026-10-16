import { describe, expect, it } from "vitest";

import {
  checkBudgetChange,
  checkCreation,
  MAX_CREATIONS_PER_DAY,
  checkStatusChange,
  committedDailyMinor,
  maxIncreasedBudgetMinor,
  type BudgetHolder,
} from "./ads-guardrails";
import type { AdsSettings } from "./ads-settings";

// The owner's limits of 2026-10-15: 1.500 ₺/day total, +50% per change, 2 changes/day.
const SETTINGS: AdsSettings = {
  automationEnabled: true,
  dailyCapMinor: 150_000,
  maxIncreasePct: 50,
  maxChangesPerEntityPerDay: 2,
};

function holder(overrides: Partial<BudgetHolder> & { id: string }): BudgetHolder {
  return {
    level: "campaign",
    name: `Kampanya ${overrides.id}`,
    delivering: true,
    status: "ACTIVE",
    dailyBudgetMinor: 30_000,
    lifetimeBudgetMinor: null,
    ...overrides,
  };
}

// 300 + 400 ₺ delivering; a paused 200 ₺ one; a lifetime one that is never counted.
const HOLDERS: BudgetHolder[] = [
  holder({ id: "1", dailyBudgetMinor: 30_000 }),
  holder({ id: "2", dailyBudgetMinor: 40_000, level: "adset" }),
  holder({ id: "3", dailyBudgetMinor: 20_000, delivering: false, status: "PAUSED" }),
  holder({ id: "4", dailyBudgetMinor: null, lifetimeBudgetMinor: 500_000 }),
];

const budget = (targetId: string, newDailyBudgetMinor: number, overrides: Partial<Parameters<typeof checkBudgetChange>[0]> = {}) =>
  checkBudgetChange({ settings: SETTINGS, holders: HOLDERS, targetId, changesToday: 0, newDailyBudgetMinor, ...overrides });

type StatusInput = Parameters<typeof checkStatusChange>[0];
const status = (overrides: Partial<StatusInput> = {}) =>
  checkStatusChange({
    settings: SETTINGS,
    changesToday: 0,
    target: { name: "Kampanya", status: "PAUSED", lifetimeBudget: false },
    to: "ACTIVE",
    committedBeforeMinor: 70_000,
    committedAfterMinor: 90_000,
    ...overrides,
  });

describe("committedDailyMinor", () => {
  it("sums only delivering daily budgets", () => {
    expect(committedDailyMinor(HOLDERS)).toBe(70_000);
  });
});

describe("maxIncreasedBudgetMinor", () => {
  it("allows +50% and rounds down to whole kuruş", () => {
    expect(maxIncreasedBudgetMinor(30_000, 50)).toBe(45_000);
    expect(maxIncreasedBudgetMinor(333, 50)).toBe(499);
  });
});

describe("checkBudgetChange", () => {
  it("allows an increase within +50% and under the total cap", () => {
    expect(budget("1", 45_000)).toEqual({ allowed: true });
  });

  it("refuses an increase over +50% and names the highest allowed budget", () => {
    const verdict = budget("1", 45_001);
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toContain("450 ₺");
  });

  it("refuses an increase that would push the committed total past the cap", () => {
    const tightCap = { ...SETTINGS, dailyCapMinor: 80_000 };
    const verdict = budget("1", 45_000, { settings: tightCap });
    expect(verdict.allowed).toBe(false);
    // 800 cap − 400 (the other delivering holder) = 400 ₺ headroom for this one.
    if (!verdict.allowed) expect(verdict.reason).toContain("en fazla 400 ₺");
  });

  it("always allows a decrease, even when the account is already over the cap", () => {
    expect(budget("2", 10_000, { settings: { ...SETTINGS, dailyCapMinor: 10_000 } })).toEqual({ allowed: true });
  });

  it("lets a paused holder's budget rise within +50% without touching the cap", () => {
    expect(budget("3", 30_000, { settings: { ...SETTINGS, dailyCapMinor: 0 } })).toEqual({ allowed: true });
  });

  it("refuses everything while automation is off", () => {
    expect(budget("1", 20_000, { settings: { ...SETTINGS, automationEnabled: false } }).allowed).toBe(false);
  });

  it("refuses once today's change allowance for the holder is used", () => {
    expect(budget("1", 20_000, { changesToday: 2 }).allowed).toBe(false);
    expect(budget("1", 20_000, { changesToday: 1 }).allowed).toBe(true);
  });

  it("refuses unknown ids, lifetime budgets, zero, fractions and no-op changes", () => {
    expect(budget("999", 20_000).allowed).toBe(false);
    expect(budget("4", 20_000).allowed).toBe(false);
    expect(budget("1", 0).allowed).toBe(false);
    expect(budget("1", 20_000.5).allowed).toBe(false);
    expect(budget("1", 30_000).allowed).toBe(false);
  });
});

describe("checkStatusChange", () => {
  it("allows switching on when the projected total stays under the cap", () => {
    expect(status()).toEqual({ allowed: true });
  });

  it("refuses switching on past the cap and names the projected total", () => {
    const verdict = status({ committedAfterMinor: 150_001 });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toContain("1.500,01 ₺");
  });

  it("allows switching on something that adds no budget, even over the cap (an ad)", () => {
    expect(status({ committedBeforeMinor: 200_000, committedAfterMinor: 200_000 })).toEqual({ allowed: true });
  });

  it("always allows pausing, even over the cap", () => {
    expect(status({ to: "PAUSED", target: { name: "K", status: "ACTIVE", lifetimeBudget: false }, committedBeforeMinor: 900_000, committedAfterMinor: 0 })).toEqual({ allowed: true });
  });

  it("refuses a no-op, lifetime budgets, a used-up day and anything while off", () => {
    expect(status({ target: { name: "K", status: "ACTIVE", lifetimeBudget: false } }).allowed).toBe(false);
    expect(status({ target: { name: "K", status: "PAUSED", lifetimeBudget: true } }).allowed).toBe(false);
    expect(status({ changesToday: 2 }).allowed).toBe(false);
    expect(status({ settings: { ...SETTINGS, automationEnabled: false } }).allowed).toBe(false);
  });
});

describe("checkCreation", () => {
  it("allows creating within the daily count, with a budget under the cap", () => {
    expect(checkCreation({ settings: SETTINGS, creationsToday: 0, initialDailyBudgetMinor: 50_000 })).toEqual({ allowed: true });
    expect(checkCreation({ settings: SETTINGS, creationsToday: 3 })).toEqual({ allowed: true });
  });

  it("refuses past the daily creation count, while off, or with a budget over the cap", () => {
    expect(checkCreation({ settings: SETTINGS, creationsToday: MAX_CREATIONS_PER_DAY }).allowed).toBe(false);
    expect(checkCreation({ settings: { ...SETTINGS, automationEnabled: false }, creationsToday: 0 }).allowed).toBe(false);
    expect(checkCreation({ settings: SETTINGS, creationsToday: 0, initialDailyBudgetMinor: 150_001 }).allowed).toBe(false);
    expect(checkCreation({ settings: SETTINGS, creationsToday: 0, initialDailyBudgetMinor: 0 }).allowed).toBe(false);
  });
});
