import { describe, expect, it } from "vitest";

import {
  adParams,
  adSetParams,
  campaignParams,
  createAdSchema,
  createAdSetSchema,
  createCampaignSchema,
  creativeParams,
  isShopLink,
  optimizationFor,
} from "./ads-creation";

describe("campaignParams", () => {
  it("creates a campaign-budget campaign PAUSED, with the budget in kuruş", () => {
    const input = createCampaignSchema.parse({ name: "Yumurta satış", objective: "OUTCOME_SALES", daily_budget_try: 250.5 });
    expect(campaignParams(input)).toEqual({
      name: "Yumurta satış",
      objective: "OUTCOME_SALES",
      status: "PAUSED",
      buying_type: "AUCTION",
      special_ad_categories: "[]",
      daily_budget: "25050",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    });
  });

  it("leaves the budget to the ad sets when none is given", () => {
    const params = campaignParams(createCampaignSchema.parse({ name: "Trafik", objective: "OUTCOME_TRAFFIC" }));
    expect(params.daily_budget).toBeUndefined();
    expect(params.is_adset_budget_sharing_enabled).toBe("false");
    expect(params.status).toBe("PAUSED");
  });

  it("rejects an unknown objective", () => {
    expect(createCampaignSchema.safeParse({ name: "x", objective: "MESSAGES" }).success).toBe(false);
  });
});

describe("optimizationFor", () => {
  it("optimizes a sales ad set for the site's Pixel purchases", () => {
    expect(optimizationFor("OUTCOME_SALES", "1234567890")).toEqual({
      ok: true,
      optimization_goal: "OFFSITE_CONVERSIONS",
      promoted_object: { pixel_id: "1234567890", custom_event_type: "PURCHASE" },
    });
  });

  it("refuses a sales ad set without a Pixel, and unknown objectives", () => {
    expect(optimizationFor("OUTCOME_SALES", null).ok).toBe(false);
    expect(optimizationFor("LINK_CLICKS", null).ok).toBe(false);
    expect(optimizationFor("OUTCOME_TRAFFIC", null)).toEqual({ ok: true, optimization_goal: "LINK_CLICKS" });
  });
});

describe("adSetParams", () => {
  it("targets a radius around a point, PAUSED, with its own budget", () => {
    const input = createAdSetSchema.parse({
      campaign_id: "200",
      name: "Malatya 15 km",
      daily_budget_try: 300,
      location: { type: "radius", latitude: 38.35, longitude: 38.31, radius_km: 15 },
      age_min: 25,
    });
    const params = adSetParams(input, { optimization_goal: "LINK_CLICKS" });
    expect(params.status).toBe("PAUSED");
    expect(params.daily_budget).toBe("30000");
    expect(JSON.parse(params.targeting!)).toEqual({
      geo_locations: { custom_locations: [{ latitude: 38.35, longitude: 38.31, radius: 15, distance_unit: "kilometer" }] },
      age_min: 25,
      age_max: 65,
      targeting_automation: { advantage_audience: 1 },
    });
    expect(params.promoted_object).toBeUndefined();
  });

  it("targets a whole country and carries the sales promoted object", () => {
    const input = createAdSetSchema.parse({ campaign_id: "200", name: "Türkiye", location: { type: "country" }, advantage_audience: false });
    const params = adSetParams(input, { optimization_goal: "OFFSITE_CONVERSIONS", promoted_object: { pixel_id: "1", custom_event_type: "PURCHASE" } });
    expect(JSON.parse(params.targeting!).geo_locations).toEqual({ countries: ["TR"] });
    expect(JSON.parse(params.targeting!).targeting_automation).toEqual({ advantage_audience: 0 });
    expect(JSON.parse(params.promoted_object!)).toEqual({ pixel_id: "1", custom_event_type: "PURCHASE" });
    expect(params.daily_budget).toBeUndefined();
  });

  it("rejects inverted ages and a radius past 80 km", () => {
    expect(createAdSetSchema.safeParse({ campaign_id: "1", name: "x", location: { type: "country" }, age_min: 40, age_max: 30 }).success).toBe(false);
    expect(createAdSetSchema.safeParse({ campaign_id: "1", name: "x", location: { type: "radius", latitude: 1, longitude: 1, radius_km: 81 } }).success).toBe(false);
  });
});

describe("ads", () => {
  const ad = createAdSchema.parse({
    adset_id: "201",
    name: "Köy yumurtası",
    message: "Gezen tavuklarımızın yumurtası kapınızda.",
    headline: "Köy yumurtası",
    link: "https://apuhanciftligi.com/",
  });

  it("only links to the shop's own site", () => {
    expect(isShopLink("https://apuhanciftligi.com/urun/yumurta", "https://apuhanciftligi.com")).toBe(true);
    expect(isShopLink("https://www.apuhanciftligi.com/", "https://apuhanciftligi.com")).toBe(true);
    expect(isShopLink("http://apuhanciftligi.com/", "https://apuhanciftligi.com")).toBe(false);
    expect(isShopLink("https://apuhanciftligi.com.evil.example/", "https://apuhanciftligi.com")).toBe(false);
    expect(isShopLink("not a url", "https://apuhanciftligi.com")).toBe(false);
  });

  it("builds the creative with the page, Instagram account and uploaded image", () => {
    const params = creativeParams(ad, { pageId: "555", instagramUserId: "777", imageHash: "abc" });
    expect(JSON.parse(params.object_story_spec!)).toEqual({
      page_id: "555",
      instagram_user_id: "777",
      link_data: {
        message: "Gezen tavuklarımızın yumurtası kapınızda.",
        link: "https://apuhanciftligi.com/",
        name: "Köy yumurtası",
        image_hash: "abc",
        call_to_action: { type: "SHOP_NOW", value: { link: "https://apuhanciftligi.com/" } },
      },
    });
    expect(JSON.parse(creativeParams(ad, { pageId: "555", instagramUserId: null, imageHash: "abc" }).object_story_spec!).instagram_user_id).toBeUndefined();
  });

  it("creates the ad PAUSED", () => {
    expect(adParams(ad, "999")).toEqual({ name: "Köy yumurtası", adset_id: "201", creative: '{"creative_id":"999"}', status: "PAUSED" });
  });
});
