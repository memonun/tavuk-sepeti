/**
 * Meta Marketing API shapes (Graph API v26.0) and the pure mapping from
 * Meta's campaign / ad set lists to the budget holders the guardrails work on.
 *
 * Everything Meta returns is parsed with these schemas at the boundary
 * (CLAUDE.md §3). Meta sends budgets as strings in the account currency's
 * minor unit — kuruş for a TRY account — and spend as a decimal string in the
 * major unit ("123.45").
 */
import { z } from "zod";

import { committedDailyMinor, type BudgetHolder } from "./ads-guardrails";

const metaId = z.string().regex(/^\d{1,32}$/);
/** Budgets: integer strings in minor units; absent or "0" = not set at this level. */
const minorString = z
  .string()
  .regex(/^\d+$/)
  .transform((value) => Number(value))
  .optional();

export const metaErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().optional(),
    code: z.number().optional(),
    error_subcode: z.number().optional(),
    error_user_title: z.string().optional(),
    error_user_msg: z.string().optional(),
    fbtrace_id: z.string().optional(),
  }),
});

export const metaAccountSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  currency: z.string(),
  account_status: z.number(),
  timezone_name: z.string().optional(),
});
export type MetaAccount = z.infer<typeof metaAccountSchema>;

export const metaCampaignSchema = z.object({
  id: metaId,
  name: z.string(),
  status: z.string(),
  effective_status: z.string().optional(),
  objective: z.string().optional(),
  daily_budget: minorString,
  lifetime_budget: minorString,
});
export type MetaCampaign = z.infer<typeof metaCampaignSchema>;

export const metaAdSetSchema = z.object({
  id: metaId,
  name: z.string(),
  status: z.string(),
  effective_status: z.string().optional(),
  campaign_id: metaId,
  daily_budget: minorString,
  lifetime_budget: minorString,
  optimization_goal: z.string().optional(),
});
export type MetaAdSet = z.infer<typeof metaAdSetSchema>;

export const metaAdSchema = z.object({
  id: metaId,
  name: z.string(),
  status: z.string(),
  effective_status: z.string().optional(),
  adset_id: metaId,
  campaign_id: metaId,
});
export type MetaAd = z.infer<typeof metaAdSchema>;

const metaActionSchema = z.object({ action_type: z.string(), value: z.string() });

export const metaInsightSchema = z.object({
  campaign_id: metaId.optional(),
  adset_id: metaId.optional(),
  spend: z.string().optional(),
  impressions: z.string().optional(),
  reach: z.string().optional(),
  clicks: z.string().optional(),
  actions: z.array(metaActionSchema).optional(),
  action_values: z.array(metaActionSchema).optional(),
  date_start: z.string(),
  date_stop: z.string(),
});
export type MetaInsight = z.infer<typeof metaInsightSchema>;

export function metaPageSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    paging: z.object({ next: z.string().url().optional() }).partial().optional(),
  });
}

export const metaCreatedSchema = z.object({ id: metaId });

/** `/act_x/adimages` answers `{ images: { <name>: { hash, url } } }`. */
export const metaAdImageUploadSchema = z.object({
  images: z.record(z.string(), z.object({ hash: z.string().min(1) })),
});

/** Meta account_status 1 = ACTIVE; anything else cannot run ads. */
export const META_ACCOUNT_ACTIVE = 1;

type HolderStatus = BudgetHolder["status"];

function holderStatus(status: string): HolderStatus {
  return status === "ACTIVE" || status === "PAUSED" ? status : "OTHER";
}

const isGone = (status: string) => status === "DELETED" || status === "ARCHIVED";
const positive = (value: number | undefined) => (value && value > 0 ? value : null);

/**
 * Where each daily budget lives. A campaign with its own budget (Advantage
 * campaign budget) is one holder; otherwise each of its ad sets is. Deleted
 * and archived items are dropped — they cannot spend.
 */
export function buildBudgetHolders(
  campaigns: readonly MetaCampaign[],
  adSets: readonly MetaAdSet[],
): BudgetHolder[] {
  const holders: BudgetHolder[] = [];
  for (const campaign of campaigns) {
    if (isGone(campaign.status)) continue;
    const campaignDaily = positive(campaign.daily_budget);
    const campaignLifetime = positive(campaign.lifetime_budget);
    if (campaignDaily !== null || campaignLifetime !== null) {
      holders.push({
        id: campaign.id,
        level: "campaign",
        name: campaign.name,
        status: holderStatus(campaign.status),
        delivering: campaign.status === "ACTIVE",
        dailyBudgetMinor: campaignDaily,
        lifetimeBudgetMinor: campaignLifetime,
      });
      continue;
    }
    for (const adSet of adSets) {
      if (adSet.campaign_id !== campaign.id || isGone(adSet.status)) continue;
      const daily = positive(adSet.daily_budget);
      const lifetime = positive(adSet.lifetime_budget);
      if (daily === null && lifetime === null) continue;
      holders.push({
        id: adSet.id,
        level: "adset",
        name: `${campaign.name} › ${adSet.name}`,
        status: holderStatus(adSet.status),
        delivering: adSet.status === "ACTIVE" && campaign.status === "ACTIVE",
        dailyBudgetMinor: daily,
        lifetimeBudgetMinor: lifetime,
      });
    }
  }
  return holders;
}

/**
 * The committed daily total (kuruş) before and after switching one campaign or
 * ad set on or off — computed by rebuilding the holders with the new status,
 * so every way a budget can start delivering is covered.
 */
export function projectCommittedDaily(
  campaigns: readonly MetaCampaign[],
  adSets: readonly MetaAdSet[],
  target: { readonly level: "campaign" | "adset" | "ad"; readonly id: string },
  to: "ACTIVE" | "PAUSED",
): { readonly before: number; readonly after: number } {
  const before = committedDailyMinor(buildBudgetHolders(campaigns, adSets));
  if (target.level === "ad") return { before, after: before };
  const nextCampaigns = target.level === "campaign" ? campaigns.map((c) => (c.id === target.id ? { ...c, status: to } : c)) : campaigns;
  const nextAdSets = target.level === "adset" ? adSets.map((a) => (a.id === target.id ? { ...a, status: to } : a)) : adSets;
  return { before, after: committedDailyMinor(buildBudgetHolders(nextCampaigns, nextAdSets)) };
}

export interface InsightSummary {
  readonly spendMinor: number;
  readonly impressions: number;
  readonly reach: number;
  readonly clicks: number;
  readonly linkClicks: number;
  readonly purchases: number;
  readonly purchaseValueMinor: number;
}

/** Meta reports one purchase under several action types; use the first present. */
const PURCHASE_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"] as const;

function firstAction(actions: MetaInsight["actions"], types: readonly string[]): number {
  for (const type of types) {
    const found = actions?.find((action) => action.action_type === type);
    if (found) return Number(found.value) || 0;
  }
  return 0;
}

const majorToMinor = (value: string | undefined) => Math.round((Number(value) || 0) * 100);
const count = (value: string | undefined) => Number(value) || 0;

export function summarizeInsight(row: MetaInsight): InsightSummary {
  return {
    spendMinor: majorToMinor(row.spend),
    impressions: count(row.impressions),
    reach: count(row.reach),
    clicks: count(row.clicks),
    linkClicks: firstAction(row.actions, ["link_click"]),
    purchases: firstAction(row.actions, PURCHASE_TYPES),
    purchaseValueMinor: Math.round(firstAction(row.action_values, PURCHASE_TYPES) * 100),
  };
}
