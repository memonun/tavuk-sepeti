/**
 * Input shapes for the Meta ad tools. Money is LIRA here (daily_budget_try),
 * unlike the other connector tools' kuruş: budgets are discussed in lira, and a
 * ×100 slip on a budget is exactly the mistake worth designing out. The ads
 * feature converts to kuruş and re-validates everything.
 */
import { z } from "zod";

import { CALL_TO_ACTIONS, CAMPAIGN_OBJECTIVES } from "@/features/ads/application/ads-public";

const metaId = z.string().regex(/^\d{1,32}$/).describe("get_ads_overview çıktısındaki Meta kimliği (sadece rakam).");
const reason = z
  .string()
  .trim()
  .min(5)
  .max(1000)
  .describe("Bu değişikliğin nedeni, sahibine giden raporda görünür. Somut yaz: hangi sonuç, hangi karar.");
const dailyBudgetTry = z.number().positive().max(100_000).describe("Günlük bütçe, TL (ör. 250 ya da 250.5).");

export const adsOverviewInput = {
  period: z
    .enum(["today", "yesterday", "last_7d", "last_30d"])
    .default("yesterday")
    .describe("Sonuçların dönemi. Günlük değerlendirme için yesterday, eğilim için last_7d."),
};

export const listAdsChangesInput = {
  since_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Bu tarihten (İstanbul, YYYY-AA-GG) bu yana yapılanlar."),
  limit: z.number().int().min(1).max(100).default(25),
};

export const setAdBudgetInput = {
  entity_id: metaId,
  daily_budget_try: dailyBudgetTry,
  reason,
};

export const setAdStatusInput = {
  entity_id: metaId,
  status: z.enum(["ACTIVE", "PAUSED"]).describe("ACTIVE = yayına al, PAUSED = durdur."),
  reason,
};

export const createAdCampaignInput = {
  name: z.string().trim().min(1).max(200),
  objective: z
    .enum(CAMPAIGN_OBJECTIVES)
    .describe("OUTCOME_SALES = sitede satış (Pixel satın almaları), OUTCOME_TRAFFIC = siteye ziyaret, OUTCOME_AWARENESS = erişim, OUTCOME_ENGAGEMENT = etkileşim."),
  daily_budget_try: dailyBudgetTry
    .optional()
    .describe("Verilirse bütçe kampanyada olur (Meta dağıtır). Verilmezse her reklam setine ayrı bütçe verilir."),
  reason,
};

export const createAdSetInput = {
  campaign_id: metaId,
  name: z.string().trim().min(1).max(200),
  daily_budget_try: dailyBudgetTry.optional().describe("Sadece kampanyanın kendi bütçesi yoksa ver."),
  location: z
    .discriminatedUnion("type", [
      z.object({ type: z.literal("country"), country_code: z.string().regex(/^[A-Z]{2}$/).default("TR") }),
      z.object({
        type: z.literal("radius"),
        latitude: z.number().gte(-90).lte(90),
        longitude: z.number().gte(-180).lte(180),
        radius_km: z.number().min(1).max(80),
      }),
    ])
    .describe("Kime gösterilsin: bütün ülke ya da bir noktanın çevresi (eve servis için Malatya merkezi çevresi)."),
  age_min: z.number().int().min(18).max(65).default(18),
  age_max: z.number().int().min(18).max(65).default(65),
  advantage_audience: z.boolean().default(true).describe("Meta kitleyi yaş aralığının dışına genişletebilsin mi."),
  reason,
};

export const createAdInput = {
  adset_id: metaId,
  name: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(2000).describe("Görselin üstündeki ana metin."),
  headline: z.string().trim().min(1).max(255).describe("Görselin altındaki kalın başlık."),
  description: z.string().trim().max(255).optional(),
  link: z.string().url().describe("Mağazanın kendi sayfası, ör. https://apuhanciftligi.com/ ya da bir ürün sayfası."),
  call_to_action: z.enum(CALL_TO_ACTIONS).default("SHOP_NOW"),
  image_url: z.string().url().describe("Herkese açık https görsel (jpg/png/webp, en fazla 5 MB) — ör. list_products çıktısındaki ürün görseli."),
  reason,
};
