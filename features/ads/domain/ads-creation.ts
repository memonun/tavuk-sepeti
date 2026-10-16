/**
 * Creating campaigns, ad sets and ads — input rules and the exact parameters
 * sent to Meta. Pure, so what we send is unit-tested without a network.
 *
 * Everything is created PAUSED. Spending starts only through a later status
 * change that passes the daily-cap guardrail (ads-guardrails.ts).
 *
 * Ads may only link to this shop's own site: a creative pointing anywhere
 * else would spend the farm's money sending people away from it.
 */
import { z } from "zod";

export const CAMPAIGN_OBJECTIVES = ["OUTCOME_SALES", "OUTCOME_TRAFFIC", "OUTCOME_AWARENESS", "OUTCOME_ENGAGEMENT"] as const;
export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number];

const name = z.string().trim().min(1, "Ad boş olamaz.").max(200, "Ad en fazla 200 karakter olabilir.");
const metaId = z.string().regex(/^\d{1,32}$/, "Meta kimliği sadece rakamlardan oluşur.");
/** TL in, kuruş out: people and the model both think in lira. */
const dailyBudgetTry = z
  .number()
  .positive("Günlük bütçe 0'dan büyük olmalı.")
  .max(100_000, "Günlük bütçe çok büyük.")
  .transform((lira) => Math.round(lira * 100));

export const createCampaignSchema = z.object({
  name,
  objective: z.enum(CAMPAIGN_OBJECTIVES),
  /** Set → the campaign carries the budget (Advantage campaign budget).
   *  Omitted → each ad set carries its own. */
  daily_budget_try: dailyBudgetTry.optional(),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

const targetingSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("country"), country_code: z.string().regex(/^[A-Z]{2}$/).default("TR") }),
  z.object({
    type: z.literal("radius"),
    latitude: z.number().gte(-90).lte(90),
    longitude: z.number().gte(-180).lte(180),
    radius_km: z.number().min(1).max(80),
  }),
]);

export const createAdSetSchema = z
  .object({
    campaign_id: metaId,
    name,
    /** Required when the campaign has no budget of its own; refused otherwise. */
    daily_budget_try: dailyBudgetTry.optional(),
    location: targetingSchema,
    age_min: z.number().int().min(18).max(65).default(18),
    age_max: z.number().int().min(18).max(65).default(65),
    /** Let Meta widen the audience beyond the given ages when it predicts sales. */
    advantage_audience: z.boolean().default(true),
  })
  .refine((value) => value.age_min <= value.age_max, { message: "En küçük yaş en büyük yaştan büyük olamaz.", path: ["age_min"] });
export type CreateAdSetInput = z.infer<typeof createAdSetSchema>;

export const CALL_TO_ACTIONS = ["SHOP_NOW", "ORDER_NOW", "LEARN_MORE"] as const;

export const createAdSchema = z.object({
  adset_id: metaId,
  name,
  /** Main text above the image. */
  message: z.string().trim().min(1).max(2000),
  /** Bold line under the image. */
  headline: z.string().trim().min(1).max(255),
  description: z.string().trim().max(255).optional(),
  /** Must be a page of this shop, e.g. https://apuhanciftligi.com/urun/koy-yumurtasi */
  link: z.string().url(),
  call_to_action: z.enum(CALL_TO_ACTIONS).default("SHOP_NOW"),
});
export type CreateAdInput = z.infer<typeof createAdSchema>;

/** The ad's link must stay on the shop's own host (apex or www). */
export function isShopLink(link: string, siteUrl: string): boolean {
  try {
    const url = new URL(link);
    const site = new URL(siteUrl);
    const bare = (host: string) => host.replace(/^www\./, "");
    return url.protocol === "https:" && bare(url.hostname) === bare(site.hostname);
  } catch {
    return false;
  }
}

/** Form fields for POST /act_{id}/campaigns. */
export function campaignParams(input: CreateCampaignInput): Record<string, string> {
  const params: Record<string, string> = {
    name: input.name,
    objective: input.objective,
    status: "PAUSED",
    buying_type: "AUCTION",
    special_ad_categories: "[]",
  };
  if (input.daily_budget_try !== undefined) {
    params.daily_budget = String(input.daily_budget_try);
    params.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
  } else {
    // Budgets live on the ad sets and are not shared between them.
    params.is_adset_budget_sharing_enabled = "false";
  }
  return params;
}

/** What each objective optimizes for, and what a sales ad set must point at. */
export function optimizationFor(objective: string, pixelId: string | null):
  | { readonly ok: true; readonly optimization_goal: string; readonly promoted_object?: Record<string, string> }
  | { readonly ok: false; readonly reason: string } {
  switch (objective) {
    case "OUTCOME_SALES":
      if (!pixelId) return { ok: false, reason: "Satış kampanyası için sitede Meta Pixel tanımlı olmalı (NEXT_PUBLIC_META_PIXEL_ID)." };
      return { ok: true, optimization_goal: "OFFSITE_CONVERSIONS", promoted_object: { pixel_id: pixelId, custom_event_type: "PURCHASE" } };
    case "OUTCOME_TRAFFIC":
      return { ok: true, optimization_goal: "LINK_CLICKS" };
    case "OUTCOME_AWARENESS":
      return { ok: true, optimization_goal: "REACH" };
    case "OUTCOME_ENGAGEMENT":
      return { ok: true, optimization_goal: "POST_ENGAGEMENT" };
    default:
      return { ok: false, reason: `Bu kampanya amacı (${objective}) için reklam seti açılamıyor.` };
  }
}

/** Form fields for POST /act_{id}/adsets. Caller has already checked the budget placement. */
export function adSetParams(
  input: CreateAdSetInput & { readonly daily_budget_try?: number | undefined },
  optimization: { readonly optimization_goal: string; readonly promoted_object?: Record<string, string> },
): Record<string, string> {
  const geo =
    input.location.type === "country"
      ? { countries: [input.location.country_code] }
      : {
          custom_locations: [
            {
              latitude: input.location.latitude,
              longitude: input.location.longitude,
              radius: input.location.radius_km,
              distance_unit: "kilometer",
            },
          ],
        };
  const params: Record<string, string> = {
    name: input.name,
    campaign_id: input.campaign_id,
    status: "PAUSED",
    billing_event: "IMPRESSIONS",
    optimization_goal: optimization.optimization_goal,
    targeting: JSON.stringify({
      geo_locations: geo,
      age_min: input.age_min,
      age_max: input.age_max,
      targeting_automation: { advantage_audience: input.advantage_audience ? 1 : 0 },
    }),
  };
  if (optimization.promoted_object) params.promoted_object = JSON.stringify(optimization.promoted_object);
  if (input.daily_budget_try !== undefined) {
    params.daily_budget = String(input.daily_budget_try);
    params.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
  }
  return params;
}

/** Form fields for POST /act_{id}/adcreatives. */
export function creativeParams(
  input: CreateAdInput,
  ids: { readonly pageId: string; readonly instagramUserId: string | null; readonly imageHash: string },
): Record<string, string> {
  return {
    name: `${input.name} görseli`,
    object_story_spec: JSON.stringify({
      page_id: ids.pageId,
      ...(ids.instagramUserId ? { instagram_user_id: ids.instagramUserId } : {}),
      link_data: {
        message: input.message,
        link: input.link,
        name: input.headline,
        ...(input.description ? { description: input.description } : {}),
        image_hash: ids.imageHash,
        call_to_action: { type: input.call_to_action, value: { link: input.link } },
      },
    }),
  };
}

/** Form fields for POST /act_{id}/ads. */
export function adParams(input: CreateAdInput, creativeId: string): Record<string, string> {
  return {
    name: input.name,
    adset_id: input.adset_id,
    creative: JSON.stringify({ creative_id: creativeId }),
    status: "PAUSED",
  };
}
