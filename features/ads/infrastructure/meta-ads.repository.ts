import "server-only";

/**
 * Meta Marketing API calls for the ad account in the config. Thin: shapes come
 * from features/ads/domain/meta-ads.ts, request bodies from ads-creation.ts.
 */
import { z } from "zod";

import {
  metaAccountSchema,
  metaAdImageUploadSchema,
  metaAdSchema,
  metaAdSetSchema,
  metaCampaignSchema,
  metaCreatedSchema,
  metaInsightSchema,
  type MetaAccount,
  type MetaAd,
  type MetaAdSet,
  type MetaCampaign,
  type MetaInsight,
} from "@/features/ads/domain/meta-ads";
import { ExternalApiError, type AppError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

import { graphGet, graphGetAll, graphPost, type GraphParams } from "./meta-graph.client";

import type { MetaAdsConfig } from "./meta-ads-config";

const CAMPAIGN_FIELDS = "id,name,status,effective_status,objective,daily_budget,lifetime_budget";
const ADSET_FIELDS = "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,optimization_goal";
const AD_FIELDS = "id,name,status,effective_status,adset_id,campaign_id";
const INSIGHT_FIELDS = "campaign_id,adset_id,spend,impressions,reach,clicks,actions,action_values";

export const INSIGHT_PRESETS = ["today", "yesterday", "last_7d", "last_30d"] as const;
export type InsightPreset = (typeof INSIGHT_PRESETS)[number];

const successSchema = z.object({ success: z.literal(true) });

export function fetchAccount(config: MetaAdsConfig): Promise<Result<MetaAccount, AppError>> {
  return graphGet(config, config.adAccountId, { fields: "id,name,currency,account_status,timezone_name" }, metaAccountSchema);
}

export function fetchCampaigns(config: MetaAdsConfig): Promise<Result<MetaCampaign[], AppError>> {
  return graphGetAll(config, `${config.adAccountId}/campaigns`, { fields: CAMPAIGN_FIELDS }, metaCampaignSchema);
}

export function fetchAdSets(config: MetaAdsConfig): Promise<Result<MetaAdSet[], AppError>> {
  return graphGetAll(config, `${config.adAccountId}/adsets`, { fields: ADSET_FIELDS }, metaAdSetSchema);
}

export function fetchAds(config: MetaAdsConfig): Promise<Result<MetaAd[], AppError>> {
  return graphGetAll(config, `${config.adAccountId}/ads`, { fields: AD_FIELDS }, metaAdSchema);
}

export function fetchCampaign(config: MetaAdsConfig, campaignId: string): Promise<Result<MetaCampaign, AppError>> {
  return graphGet(config, campaignId, { fields: CAMPAIGN_FIELDS }, metaCampaignSchema);
}

export function fetchInsights(
  config: MetaAdsConfig,
  level: "campaign" | "adset",
  preset: InsightPreset,
): Promise<Result<MetaInsight[], AppError>> {
  return graphGetAll(
    config,
    `${config.adAccountId}/insights`,
    { level, date_preset: preset, fields: INSIGHT_FIELDS },
    metaInsightSchema,
  );
}

async function update(config: MetaAdsConfig, id: string, params: GraphParams): Promise<Result<void, AppError>> {
  const result = await graphPost(config, id, params, successSchema);
  return result.ok ? ok(undefined) : result;
}

export function updateDailyBudget(config: MetaAdsConfig, id: string, dailyBudgetMinor: number): Promise<Result<void, AppError>> {
  return update(config, id, { daily_budget: String(dailyBudgetMinor) });
}

export function updateStatus(config: MetaAdsConfig, id: string, status: "ACTIVE" | "PAUSED"): Promise<Result<void, AppError>> {
  return update(config, id, { status });
}

async function create(config: MetaAdsConfig, edge: string, params: GraphParams): Promise<Result<string, AppError>> {
  const result = await graphPost(config, `${config.adAccountId}/${edge}`, params, metaCreatedSchema);
  return result.ok ? ok(result.value.id) : result;
}

export const createCampaign = (config: MetaAdsConfig, params: GraphParams) => create(config, "campaigns", params);
export const createAdSet = (config: MetaAdsConfig, params: GraphParams) => create(config, "adsets", params);
export const createCreative = (config: MetaAdsConfig, params: GraphParams) => create(config, "adcreatives", params);
export const createAd = (config: MetaAdsConfig, params: GraphParams) => create(config, "ads", params);

/** Uploads image bytes to the account's image library; returns the image hash. */
export async function uploadAdImage(config: MetaAdsConfig, bytes: Uint8Array): Promise<Result<string, AppError>> {
  const result = await graphPost(
    config,
    `${config.adAccountId}/adimages`,
    { bytes: Buffer.from(bytes).toString("base64") },
    metaAdImageUploadSchema,
  );
  if (!result.ok) return result;
  const hash = Object.values(result.value.images)[0]?.hash;
  return hash ? ok(hash) : err(new ExternalApiError({ message: "Görsel Meta'ya yüklendi ama kimliği okunamadı." }));
}
