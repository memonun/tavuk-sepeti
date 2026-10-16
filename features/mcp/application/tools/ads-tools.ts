/**
 * Meta ad tools — read the account, change budgets, switch things on and off,
 * and create campaigns / ad sets / ads.
 *
 * The owner chose (2026-10-15) to let Claude apply changes automatically
 * within his limits and report each one. So the limits are not prompts: every
 * write goes through features/ads, which re-reads the limits and Meta's live
 * state and refuses anything over them. A refusal comes back as a plain
 * Turkish reason the model can act on (pick a smaller number, pause something
 * else, wait for tomorrow).
 */
import "server-only";

import { listAdsChangesAction } from "@/features/ads/application/ads-settings-actions";
import { changeAdBudget, setAdStatus } from "@/features/ads/application/change-ads";
import { createAdsAd, createAdsAdSet, createAdsCampaign } from "@/features/ads/application/create-ads";
import { getAdsOverview } from "@/features/ads/application/get-ads-overview";
import { createAdSchema, createAdSetSchema, createCampaignSchema } from "@/features/ads/application/ads-public";
import { fetchRemoteImage } from "@/features/mcp/infrastructure/fetch-remote-image";
import { istanbulInstant } from "@/shared/utils/date";

import {
  adsOverviewInput,
  createAdCampaignInput,
  createAdInput,
  createAdSetInput,
  listAdsChangesInput,
  setAdBudgetInput,
  setAdStatusInput,
} from "./ads-inputs";
import { READ_ONLY, WRITE } from "./annotations";
import { toolError, toolFromResult, toolRefusal } from "../tool-result";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppError } from "@/shared/errors/app-error";
import type { Result } from "@/shared/result";

/** Talks to Meta: an outside system, and it spends money. */
const ADS_WRITE = { ...WRITE, openWorldHint: true } as const;
const ADS_READ = { ...READ_ONLY, openWorldHint: true } as const;

const lira = (minor: number | null) => (minor === null ? null : minor / 100);

/** Business-rule refusals (limits, Meta's own "no") go back verbatim; the rest is masked. */
function answer<T>(tool: string, result: Result<T, AppError>, context: Record<string, unknown> = {}) {
  if (!result.ok && (result.error.code === "BUSINESS_RULE_VIOLATION" || result.error.code === "VALIDATION_ERROR" || result.error.code === "NOT_FOUND" || result.error.code === "FORBIDDEN" || result.error.code === "RATE_LIMITED")) {
    return toolRefusal(result.error.message);
  }
  return toolFromResult(tool, result, context);
}

const ADS_GUIDE =
  "Limitler sunucuda zorunlu: aktif günlük bütçelerin toplamı tavanı aşamaz, bir değişiklikte bütçe en fazla belirlenen yüzde kadar artar, aynı kampanya/reklam setine günde sınırlı sayıda dokunulur. Yeni açılan her şey DURDURULMUŞ açılır.";

export function registerAdsTools(server: McpServer): void {
  server.registerTool(
    "get_ads_overview",
    {
      title: "Meta reklamları — durum ve sonuçlar",
      description:
        `Meta reklam hesabının durumu: limitler, kullanılan günlük toplam bütçe, bütçe taşıyan her kampanya/reklam setinin günlük bütçesi ve seçilen dönemdeki harcama, erişim, tıklama ve Pixel satın almaları; kampanyalar ve reklamlar. Tutarlar TL. ${ADS_GUIDE}`,
      inputSchema: adsOverviewInput,
      annotations: { ...ADS_READ, title: "Meta reklamları" },
    },
    async ({ period }) => {
      try {
        const result = await getAdsOverview(period);
        if (!result.ok) return answer("get_ads_overview", result);
        const overview = result.value;
        return toolFromResult("get_ads_overview", {
          ok: true,
          value: {
            account: overview.account,
            period: overview.period,
            limits: {
              automationEnabled: overview.settings.automationEnabled,
              dailyCapTry: lira(overview.settings.dailyCapMinor),
              maxIncreasePct: overview.settings.maxIncreasePct,
              maxChangesPerEntityPerDay: overview.settings.maxChangesPerEntityPerDay,
            },
            committedDailyTry: lira(overview.committedDailyMinor),
            headroomTry: lira(Math.max(0, overview.settings.dailyCapMinor - overview.committedDailyMinor)),
            budgetHolders: overview.budgetHolders.map((holder) => ({
              id: holder.id,
              level: holder.level,
              name: holder.name,
              status: holder.status,
              delivering: holder.delivering,
              dailyBudgetTry: lira(holder.dailyBudgetMinor),
              lifetimeBudgetTry: lira(holder.lifetimeBudgetMinor),
              results: holder.results
                ? {
                    spendTry: lira(holder.results.spendMinor),
                    impressions: holder.results.impressions,
                    reach: holder.results.reach,
                    clicks: holder.results.clicks,
                    linkClicks: holder.results.linkClicks,
                    purchases: holder.results.purchases,
                    purchaseValueTry: lira(holder.results.purchaseValueMinor),
                  }
                : null,
            })),
            campaigns: overview.campaigns,
            ads: overview.ads,
          },
        });
      } catch (cause) {
        return toolError("get_ads_overview", cause);
      }
    },
  );

  server.registerTool(
    "list_ads_changes",
    {
      title: "Meta reklam değişiklik geçmişi",
      description: "Reklamlarda yapılan bütçe/durum değişiklikleri ve yeni açılanlar, en yenisi önce. Sahibine rapor hazırlarken kullan. Tutarlar TL.",
      inputSchema: listAdsChangesInput,
      annotations: { ...READ_ONLY, title: "Reklam değişiklik geçmişi" },
    },
    async ({ since_date, limit }) => {
      try {
        const result = await listAdsChangesAction({
          limit,
          ...(since_date ? { sinceIso: istanbulInstant(since_date).toISOString() } : {}),
        });
        if (!result.ok) return answer("list_ads_changes", result);
        return toolFromResult("list_ads_changes", {
          ok: true,
          value: result.value.map((row) => ({
            at: row.created_at,
            id: row.entity_id,
            level: row.entity_level,
            name: row.entity_name,
            action: row.action,
            beforeDailyBudgetTry: lira(row.before_daily_budget_minor),
            afterDailyBudgetTry: lira(row.after_daily_budget_minor),
            reason: row.reason,
            source: row.source,
          })),
        });
      } catch (cause) {
        return toolError("list_ads_changes", cause);
      }
    },
  );

  server.registerTool(
    "set_ad_budget",
    {
      title: "Reklam bütçesini değiştir",
      description: `Bütçe taşıyan bir kampanyanın ya da reklam setinin günlük bütçesini değiştirir (TL). Düşürmek her zaman serbest; artış limitlere tabi. ${ADS_GUIDE}`,
      inputSchema: setAdBudgetInput,
      annotations: { ...ADS_WRITE, title: "Reklam bütçesini değiştir" },
    },
    async ({ entity_id, daily_budget_try, reason }) => {
      try {
        const result = await changeAdBudget({
          entityId: entity_id,
          newDailyBudgetMinor: Math.round(daily_budget_try * 100),
          reason,
          source: "mcp",
        });
        return answer("set_ad_budget", result, { entityId: entity_id });
      } catch (cause) {
        return toolError("set_ad_budget", cause, { entityId: entity_id });
      }
    },
  );

  server.registerTool(
    "set_ad_status",
    {
      title: "Reklamı aç / durdur",
      description: `Bir kampanyayı, reklam setini ya da reklamı yayına alır (ACTIVE) veya durdurur (PAUSED). Durdurmak her zaman serbest; açmak, toplam günlük bütçe tavanı aşılmayacaksa yapılır. Bir reklamın yayında olması için reklam, reklam seti ve kampanyanın üçü de ACTIVE olmalı. ${ADS_GUIDE}`,
      inputSchema: setAdStatusInput,
      annotations: { ...ADS_WRITE, title: "Reklamı aç / durdur" },
    },
    async ({ entity_id, status, reason }) => {
      try {
        const result = await setAdStatus({ entityId: entity_id, to: status, reason, source: "mcp" });
        return answer("set_ad_status", result, { entityId: entity_id });
      } catch (cause) {
        return toolError("set_ad_status", cause, { entityId: entity_id });
      }
    },
  );

  server.registerTool(
    "create_ad_campaign",
    {
      title: "Yeni reklam kampanyası aç",
      description: `Yeni bir Meta kampanyası açar (DURDURULMUŞ). Sonra create_ad_set, create_ad, en son set_ad_status ile yayına al. ${ADS_GUIDE}`,
      inputSchema: createAdCampaignInput,
      annotations: { ...ADS_WRITE, title: "Yeni reklam kampanyası" },
    },
    async ({ reason, ...fields }) => {
      try {
        const parsed = createCampaignSchema.safeParse(fields);
        if (!parsed.success) return toolRefusal(parsed.error.issues[0]?.message ?? "Geçersiz kampanya bilgisi.");
        return answer("create_ad_campaign", await createAdsCampaign({ ...parsed.data, reason, source: "mcp" }));
      } catch (cause) {
        return toolError("create_ad_campaign", cause);
      }
    },
  );

  server.registerTool(
    "create_ad_set",
    {
      title: "Yeni reklam seti aç",
      description: `Bir kampanyanın içine yeni reklam seti açar (DURDURULMUŞ): kime, nerede gösterileceği ve — kampanyanın kendi bütçesi yoksa — günlük bütçe. Optimizasyon kampanya amacından gelir (satış = site Pixel'indeki satın almalar). ${ADS_GUIDE}`,
      inputSchema: createAdSetInput,
      annotations: { ...ADS_WRITE, title: "Yeni reklam seti" },
    },
    async ({ reason, ...fields }) => {
      try {
        const parsed = createAdSetSchema.safeParse(fields);
        if (!parsed.success) return toolRefusal(parsed.error.issues[0]?.message ?? "Geçersiz reklam seti bilgisi.");
        return answer("create_ad_set", await createAdsAdSet({ ...parsed.data, reason, source: "mcp" }));
      } catch (cause) {
        return toolError("create_ad_set", cause);
      }
    },
  );

  server.registerTool(
    "create_ad",
    {
      title: "Yeni reklam aç",
      description: `Bir reklam setine görselli yeni reklam açar (DURDURULMUŞ). Görsel verilen bağlantıdan indirilip Meta'ya yüklenir; bağlantı sadece mağazanın kendi sitesine gidebilir. Meta her reklamı yayından önce inceler. ${ADS_GUIDE}`,
      inputSchema: createAdInput,
      annotations: { ...ADS_WRITE, title: "Yeni reklam" },
    },
    async ({ image_url, reason, ...fields }) => {
      try {
        const parsed = createAdSchema.safeParse(fields);
        if (!parsed.success) return toolRefusal(parsed.error.issues[0]?.message ?? "Geçersiz reklam bilgisi.");
        const image = await fetchRemoteImage(image_url);
        if (!image.ok) return toolRefusal(image.error.message);
        return answer("create_ad", await createAdsAd({ ...parsed.data, image: image.value.bytes, reason, source: "mcp" }));
      } catch (cause) {
        return toolError("create_ad", cause);
      }
    },
  );
}
