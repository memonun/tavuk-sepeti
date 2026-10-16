import "server-only";

/**
 * Everything needed to judge the account in one read: the limits, how much of
 * the daily cap is committed, each budget holder with its results for the
 * chosen period, and the ads under each ad set.
 */
import { committedDailyMinor, type BudgetHolder } from "@/features/ads/domain/ads-guardrails";
import type { AdsSettings } from "@/features/ads/domain/ads-settings";
import { buildBudgetHolders, summarizeInsight, type InsightSummary } from "@/features/ads/domain/meta-ads";
import { fetchAdsSettings } from "@/features/ads/infrastructure/ads-settings.repository";
import {
  fetchAds,
  fetchAdSets,
  fetchCampaigns,
  fetchInsights,
  type InsightPreset,
} from "@/features/ads/infrastructure/meta-ads.repository";
import type { AppError } from "@/shared/errors/app-error";
import { ok, type Result } from "@/shared/result";

import { loadAdsContext } from "./ads-context";

export interface AdsOverview {
  readonly account: { readonly id: string; readonly name: string | null };
  readonly settings: AdsSettings;
  readonly committedDailyMinor: number;
  readonly period: InsightPreset;
  readonly campaigns: ReadonlyArray<{ readonly id: string; readonly name: string; readonly status: string; readonly objective: string | null; readonly carriesBudget: boolean }>;
  readonly budgetHolders: ReadonlyArray<BudgetHolder & { readonly results: InsightSummary | null }>;
  readonly ads: ReadonlyArray<{ readonly id: string; readonly name: string; readonly status: string; readonly effectiveStatus: string | null; readonly adSetId: string; readonly campaignId: string }>;
}

export async function getAdsOverview(period: InsightPreset): Promise<Result<AdsOverview, AppError>> {
  const context = await loadAdsContext();
  if (!context.ok) return context;
  const { config, account } = context.value;

  // Independent reads, fetched together.
  const [campaigns, adSets, ads, campaignInsights, adSetInsights, settings] = await Promise.all([
    fetchCampaigns(config),
    fetchAdSets(config),
    fetchAds(config),
    fetchInsights(config, "campaign", period),
    fetchInsights(config, "adset", period),
    fetchAdsSettings(),
  ]);
  if (!campaigns.ok) return campaigns;
  if (!adSets.ok) return adSets;
  if (!ads.ok) return ads;
  if (!campaignInsights.ok) return campaignInsights;
  if (!adSetInsights.ok) return adSetInsights;

  const holders = buildBudgetHolders(campaigns.value, adSets.value);
  const resultsFor = (holder: BudgetHolder) => {
    const row =
      holder.level === "campaign"
        ? campaignInsights.value.find((insight) => insight.campaign_id === holder.id)
        : adSetInsights.value.find((insight) => insight.adset_id === holder.id);
    return row ? summarizeInsight(row) : null;
  };
  const budgetCampaignIds = new Set(holders.filter((holder) => holder.level === "campaign").map((holder) => holder.id));

  return ok({
    account: { id: account.id, name: account.name ?? null },
    settings,
    committedDailyMinor: committedDailyMinor(holders),
    period,
    campaigns: campaigns.value
      .filter((campaign) => campaign.status !== "DELETED" && campaign.status !== "ARCHIVED")
      .map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        objective: campaign.objective ?? null,
        carriesBudget: budgetCampaignIds.has(campaign.id),
      })),
    budgetHolders: holders.map((holder) => ({ ...holder, results: resultsFor(holder) })),
    ads: ads.value
      .filter((ad) => ad.status !== "DELETED" && ad.status !== "ARCHIVED")
      .map((ad) => ({
        id: ad.id,
        name: ad.name,
        status: ad.status,
        effectiveStatus: ad.effective_status ?? null,
        adSetId: ad.adset_id,
        campaignId: ad.campaign_id,
      })),
  });
}
