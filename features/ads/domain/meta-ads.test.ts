import { describe, expect, it } from "vitest";

import {
  buildBudgetHolders,
  metaCampaignSchema,
  metaAdSetSchema,
  metaInsightSchema,
  projectCommittedDaily,
  summarizeInsight,
} from "./meta-ads";

// Shapes as Meta's Graph API returns them (mocked; no network in tests).
const campaigns = [
  { id: "100", name: "Yumurta CBO", status: "ACTIVE", daily_budget: "50000" },
  { id: "200", name: "Peynir", status: "ACTIVE" },
  { id: "300", name: "Eski", status: "ARCHIVED", daily_budget: "90000" },
  { id: "400", name: "Bayram", status: "PAUSED", lifetime_budget: "1000000" },
].map((row) => metaCampaignSchema.parse(row));

const adSets = [
  { id: "201", name: "Malatya 10 km", status: "ACTIVE", campaign_id: "200", daily_budget: "30000" },
  { id: "202", name: "Türkiye", status: "PAUSED", campaign_id: "200", daily_budget: "20000" },
  { id: "203", name: "Silinmiş", status: "DELETED", campaign_id: "200", daily_budget: "20000" },
  { id: "101", name: "CBO set", status: "ACTIVE", campaign_id: "100", daily_budget: "0" },
].map((row) => metaAdSetSchema.parse(row));

describe("buildBudgetHolders", () => {
  const holders = buildBudgetHolders(campaigns, adSets);

  it("uses the campaign as the holder when the campaign carries the budget", () => {
    expect(holders.find((h) => h.id === "100")).toMatchObject({ level: "campaign", dailyBudgetMinor: 50_000, delivering: true });
    expect(holders.some((h) => h.id === "101")).toBe(false);
  });

  it("uses the ad sets when the campaign has no budget of its own", () => {
    expect(holders.find((h) => h.id === "201")).toMatchObject({ level: "adset", dailyBudgetMinor: 30_000, delivering: true, name: "Peynir › Malatya 10 km" });
    expect(holders.find((h) => h.id === "202")).toMatchObject({ status: "PAUSED", delivering: false });
  });

  it("drops archived and deleted items and keeps lifetime budgets apart", () => {
    expect(holders.map((h) => h.id).sort()).toEqual(["100", "201", "202", "400"]);
    expect(holders.find((h) => h.id === "400")).toMatchObject({ dailyBudgetMinor: null, lifetimeBudgetMinor: 1_000_000 });
  });

  it("treats an ad set as not delivering when its campaign is paused", () => {
    const paused = buildBudgetHolders([{ ...campaigns[1]!, status: "PAUSED" }], adSets);
    expect(paused.find((h) => h.id === "201")?.delivering).toBe(false);
  });
});

describe("projectCommittedDaily", () => {
  // Committed now: CBO campaign 100 (500 ₺) + ad set 201 (300 ₺) = 800 ₺.
  it("adds an ad set's budget when it is switched on under a running campaign", () => {
    expect(projectCommittedDaily(campaigns, adSets, { level: "adset", id: "202" }, "ACTIVE")).toEqual({ before: 80_000, after: 100_000 });
  });

  it("removes every ad set budget under a campaign that is switched off", () => {
    expect(projectCommittedDaily(campaigns, adSets, { level: "campaign", id: "200" }, "PAUSED")).toEqual({ before: 80_000, after: 50_000 });
  });

  it("counts the ad sets' budgets when their budget-less campaign is switched back on", () => {
    const paused = campaigns.map((c) => (c.id === "200" ? { ...c, status: "PAUSED" } : c));
    expect(projectCommittedDaily(paused, adSets, { level: "campaign", id: "200" }, "ACTIVE")).toEqual({ before: 50_000, after: 80_000 });
  });

  it("leaves the total unchanged for an ad", () => {
    expect(projectCommittedDaily(campaigns, adSets, { level: "ad", id: "999" }, "ACTIVE")).toEqual({ before: 80_000, after: 80_000 });
  });
});

describe("summarizeInsight", () => {
  it("converts spend to kuruş and reads purchases from the first known action type", () => {
    const row = metaInsightSchema.parse({
      campaign_id: "100",
      spend: "123.45",
      impressions: "5400",
      reach: "3100",
      clicks: "210",
      actions: [
        { action_type: "link_click", value: "180" },
        { action_type: "offsite_conversion.fb_pixel_purchase", value: "4" },
        { action_type: "omni_purchase", value: "5" },
      ],
      action_values: [{ action_type: "omni_purchase", value: "1750.5" }],
      date_start: "2026-10-14",
      date_stop: "2026-10-14",
    });
    expect(summarizeInsight(row)).toEqual({
      spendMinor: 12_345,
      impressions: 5_400,
      reach: 3_100,
      clicks: 210,
      linkClicks: 180,
      purchases: 5,
      purchaseValueMinor: 175_050,
    });
  });

  it("returns zeros for a day without delivery", () => {
    const row = metaInsightSchema.parse({ date_start: "2026-10-14", date_stop: "2026-10-14" });
    expect(summarizeInsight(row).spendMinor).toBe(0);
    expect(summarizeInsight(row).purchases).toBe(0);
  });
});
