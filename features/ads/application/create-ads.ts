import "server-only";

/**
 * Creating campaigns, ad sets and ads. Everything is created PAUSED (see
 * ads-creation.ts); it starts spending only through `setAdStatus`, which runs
 * the daily-cap guardrail. Each creation is logged in meta_ads_changes and
 * counts toward the daily creation limit.
 */
import { checkCreation } from "@/features/ads/domain/ads-guardrails";
import {
  adParams,
  adSetParams,
  campaignParams,
  creativeParams,
  isShopLink,
  optimizationFor,
  type CreateAdInput,
  type CreateAdSetInput,
  type CreateCampaignInput,
} from "@/features/ads/domain/ads-creation";
import { countCreationsToday, insertAdsChange } from "@/features/ads/infrastructure/ads-changes.repository";
import { fetchAdsSettings } from "@/features/ads/infrastructure/ads-settings.repository";
import {
  createAd as createMetaAd,
  createAdSet as createMetaAdSet,
  createCampaign as createMetaCampaign,
  createCreative,
  fetchCampaign,
  uploadAdImage,
} from "@/features/ads/infrastructure/meta-ads.repository";
import { getMetaPixelId } from "@/shared/analytics/meta-pixel-config";
import { env } from "@/shared/env";
import { AppError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";
import { err, ok, type Result } from "@/shared/result";

import { loadAdsContext, type AdsContext } from "./ads-context";
import type { ChangeSource } from "./change-ads";

export interface AdsCreationOutcome {
  readonly id: string;
  readonly level: "campaign" | "adset" | "ad";
  readonly name: string;
  readonly status: "PAUSED";
  readonly dailyBudgetMinor: number | null;
  readonly next: string;
  readonly warning?: string;
}

const rule = (message: string) => err(new AppError(ErrorCode.BUSINESS_RULE_VIOLATION, { message }));

/** Context + the creation guard, shared by all three. */
async function prepare(initialDailyBudgetMinor?: number): Promise<Result<AdsContext, AppError>> {
  const context = await loadAdsContext();
  if (!context.ok) return context;
  const [settings, creationsToday] = await Promise.all([fetchAdsSettings(), countCreationsToday()]);
  if (!creationsToday.ok) return creationsToday;
  const verdict = checkCreation({
    settings,
    creationsToday: creationsToday.value,
    ...(initialDailyBudgetMinor !== undefined ? { initialDailyBudgetMinor } : {}),
  });
  return verdict.allowed ? context : rule(verdict.reason);
}

async function logCreation(
  context: AdsContext,
  entry: { readonly id: string; readonly level: "campaign" | "adset" | "ad"; readonly name: string; readonly dailyBudgetMinor: number | null; readonly reason: string; readonly source: ChangeSource },
): Promise<{ readonly warning?: string }> {
  const logged = await insertAdsChange({
    entityId: entry.id,
    entityLevel: entry.level,
    entityName: entry.name,
    action: "create",
    beforeDailyBudgetMinor: null,
    afterDailyBudgetMinor: entry.dailyBudgetMinor,
    reason: entry.reason,
    source: entry.source,
    actorId: context.actorId,
  });
  return logged.ok ? {} : { warning: "Meta'da oluşturuldu ama kayıt geçmişine yazılamadı." };
}

export async function createAdsCampaign(
  input: CreateCampaignInput & { readonly reason: string; readonly source: ChangeSource },
): Promise<Result<AdsCreationOutcome, AppError>> {
  const context = await prepare(input.daily_budget_try);
  if (!context.ok) return context;

  const created = await createMetaCampaign(context.value.config, campaignParams(input));
  if (!created.ok) return created;

  const budget = input.daily_budget_try ?? null;
  const logged = await logCreation(context.value, { id: created.value, level: "campaign", name: input.name, dailyBudgetMinor: budget, reason: input.reason, source: input.source });
  return ok({
    id: created.value,
    level: "campaign",
    name: input.name,
    status: "PAUSED",
    dailyBudgetMinor: budget,
    next: budget === null
      ? "Kampanya durdurulmuş açıldı. Şimdi create_ad_set ile günlük bütçeli bir reklam seti ekle."
      : "Kampanya durdurulmuş açıldı. Şimdi create_ad_set ile bütçesiz bir reklam seti ekle (bütçe kampanyada).",
    ...logged,
  });
}

export async function createAdsAdSet(
  input: CreateAdSetInput & { readonly reason: string; readonly source: ChangeSource },
): Promise<Result<AdsCreationOutcome, AppError>> {
  const context = await prepare(input.daily_budget_try);
  if (!context.ok) return context;

  const campaign = await fetchCampaign(context.value.config, input.campaign_id);
  if (!campaign.ok) return campaign;
  const campaignCarriesBudget = (campaign.value.daily_budget ?? 0) > 0 || (campaign.value.lifetime_budget ?? 0) > 0;
  if (campaignCarriesBudget && input.daily_budget_try !== undefined) {
    return rule(`"${campaign.value.name}" bütçeyi kampanya seviyesinde taşıyor; reklam setine ayrıca bütçe verilemez. daily_budget_try göndermeden tekrar dene.`);
  }
  if (!campaignCarriesBudget && input.daily_budget_try === undefined) {
    return rule(`"${campaign.value.name}" kampanyasının kendi bütçesi yok; reklam setine daily_budget_try ver.`);
  }

  const optimization = optimizationFor(campaign.value.objective ?? "", getMetaPixelId());
  if (!optimization.ok) return rule(optimization.reason);

  const created = await createMetaAdSet(context.value.config, adSetParams(input, optimization));
  if (!created.ok) return created;

  const budget = input.daily_budget_try ?? null;
  const name = `${campaign.value.name} › ${input.name}`;
  const logged = await logCreation(context.value, { id: created.value, level: "adset", name, dailyBudgetMinor: budget, reason: input.reason, source: input.source });
  return ok({
    id: created.value,
    level: "adset",
    name,
    status: "PAUSED",
    dailyBudgetMinor: budget,
    next: "Reklam seti durdurulmuş açıldı. create_ad ile en az bir reklam ekle, sonra set_ad_status ile kampanyayı/reklam setini aç (tavan kontrolünden geçer).",
    ...logged,
  });
}

export async function createAdsAd(
  input: CreateAdInput & { readonly image: Uint8Array; readonly reason: string; readonly source: ChangeSource },
): Promise<Result<AdsCreationOutcome, AppError>> {
  if (!isShopLink(input.link, env.NEXT_PUBLIC_APP_URL)) {
    return rule("Reklam bağlantısı sadece mağazanın kendi sitesine (https://apuhanciftligi.com/...) gidebilir.");
  }
  const context = await prepare();
  if (!context.ok) return context;
  const { config } = context.value;
  if (!config.pageId) {
    return rule("Reklam açmak için Facebook sayfası gerekli: Vercel'de META_PAGE_ID tanımlanmalı.");
  }

  const imageHash = await uploadAdImage(config, input.image);
  if (!imageHash.ok) return imageHash;
  const creative = await createCreative(
    config,
    creativeParams(input, { pageId: config.pageId, instagramUserId: config.instagramUserId ?? null, imageHash: imageHash.value }),
  );
  if (!creative.ok) return creative;
  const created = await createMetaAd(config, adParams(input, creative.value));
  if (!created.ok) return created;

  const logged = await logCreation(context.value, { id: created.value, level: "ad", name: input.name, dailyBudgetMinor: null, reason: input.reason, source: input.source });
  return ok({
    id: created.value,
    level: "ad",
    name: input.name,
    status: "PAUSED",
    dailyBudgetMinor: null,
    next: "Reklam durdurulmuş açıldı ve Meta incelemesine girecek. Yayına almak için set_ad_status ile reklamı, reklam setini ve kampanyayı ACTIVE yap (bütçe taşıyanı açarken tavan kontrolü yapılır).",
    ...logged,
  });
}
