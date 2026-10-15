import "server-only";

/**
 * Budget changes on a budget holder (campaign or ad set), and switching any
 * campaign, ad set or ad on or off.
 *
 * Order, every time: load FRESH state from Meta and the limits from the
 * database → run the guardrail → write to Meta → log the change. The model's
 * own view of the account is never trusted for the cap; it may be minutes old.
 *
 * Known limit: two changes started at the same instant could each pass the cap
 * check before either lands. Automation runs one routine at a time, and the
 * owner's account-level spending limit in Meta backs this up.
 */
import {
  checkBudgetChange,
  checkStatusChange,
  committedDailyMinor,
  type BudgetHolder,
  type GuardrailVerdict,
} from "@/features/ads/domain/ads-guardrails";
import { buildBudgetHolders, projectCommittedDaily } from "@/features/ads/domain/meta-ads";
import { countChangesToday, insertAdsChange } from "@/features/ads/infrastructure/ads-changes.repository";
import { fetchAdsSettings } from "@/features/ads/infrastructure/ads-settings.repository";
import { fetchAds, fetchAdSets, fetchCampaigns, updateDailyBudget, updateStatus } from "@/features/ads/infrastructure/meta-ads.repository";
import { AppError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";
import { err, ok, type Result } from "@/shared/result";

import { loadAdsContext, type AdsContext } from "./ads-context";

export type ChangeSource = "mcp" | "panel";

export interface AdsChangeOutcome {
  readonly id: string;
  readonly level: BudgetHolder["level"] | "ad";
  readonly name: string;
  readonly beforeDailyBudgetMinor: number | null;
  readonly afterDailyBudgetMinor: number | null;
  readonly status: "ACTIVE" | "PAUSED" | "OTHER";
  /** Sum of delivering daily budgets after the change (kuruş). */
  readonly committedDailyMinor: number;
  readonly dailyCapMinor: number;
  /** Set when Meta accepted the change but the log row could not be written. */
  readonly warning?: string;
}

const refused = (verdict: Extract<GuardrailVerdict, { allowed: false }>) =>
  err(new AppError(ErrorCode.BUSINESS_RULE_VIOLATION, { message: verdict.reason }));

async function freshState(context: AdsContext, entityId: string) {
  const [settings, campaigns, adSets, changesToday] = await Promise.all([
    fetchAdsSettings(),
    fetchCampaigns(context.config),
    fetchAdSets(context.config),
    countChangesToday(entityId),
  ]);
  if (!campaigns.ok) return campaigns;
  if (!adSets.ok) return adSets;
  if (!changesToday.ok) return changesToday;
  return ok({ settings, holders: buildBudgetHolders(campaigns.value, adSets.value), changesToday: changesToday.value });
}

const LOG_WARNING = "Değişiklik Meta'da yapıldı ama kayıt geçmişine yazılamadı.";

export async function changeAdBudget(input: {
  readonly entityId: string;
  readonly newDailyBudgetMinor: number;
  readonly reason: string;
  readonly source: ChangeSource;
}): Promise<Result<AdsChangeOutcome, AppError>> {
  const context = await loadAdsContext();
  if (!context.ok) return context;
  const state = await freshState(context.value, input.entityId);
  if (!state.ok) return state;
  const { settings, holders, changesToday } = state.value;

  const verdict = checkBudgetChange({
    settings,
    holders,
    targetId: input.entityId,
    changesToday,
    newDailyBudgetMinor: input.newDailyBudgetMinor,
  });
  if (!verdict.allowed) return refused(verdict);

  const target = holders.find((holder) => holder.id === input.entityId)!;
  const written = await updateDailyBudget(context.value.config, target.id, input.newDailyBudgetMinor);
  if (!written.ok) return written;

  const logged = await insertAdsChange({
    entityId: target.id,
    entityLevel: target.level,
    entityName: target.name,
    action: "budget",
    beforeDailyBudgetMinor: target.dailyBudgetMinor,
    afterDailyBudgetMinor: input.newDailyBudgetMinor,
    reason: input.reason,
    source: input.source,
    actorId: context.value.actorId,
  });

  const after = holders.map((holder) => (holder.id === target.id ? { ...holder, dailyBudgetMinor: input.newDailyBudgetMinor } : holder));
  return ok({
    id: target.id,
    level: target.level,
    name: target.name,
    beforeDailyBudgetMinor: target.dailyBudgetMinor,
    afterDailyBudgetMinor: input.newDailyBudgetMinor,
    status: target.status,
    committedDailyMinor: committedDailyMinor(after),
    dailyCapMinor: settings.dailyCapMinor,
    ...(logged.ok ? {} : { warning: LOG_WARNING }),
  });
}

/**
 * Switches a campaign, ad set or ad on or off. The cap is checked on the
 * committed total before and after this exact change (projectCommittedDaily),
 * which covers a budget holder, a budget-less campaign over its ad sets, and
 * ads (no budget of their own).
 */
export async function setAdStatus(input: {
  readonly entityId: string;
  readonly to: "ACTIVE" | "PAUSED";
  readonly reason: string;
  readonly source: ChangeSource;
}): Promise<Result<AdsChangeOutcome, AppError>> {
  const context = await loadAdsContext();
  if (!context.ok) return context;
  const { config } = context.value;

  const [settings, campaigns, adSets, ads, changesToday] = await Promise.all([
    fetchAdsSettings(),
    fetchCampaigns(config),
    fetchAdSets(config),
    fetchAds(config),
    countChangesToday(input.entityId),
  ]);
  if (!campaigns.ok) return campaigns;
  if (!adSets.ok) return adSets;
  if (!ads.ok) return ads;
  if (!changesToday.ok) return changesToday;

  const campaign = campaigns.value.find((item) => item.id === input.entityId);
  const adSet = adSets.value.find((item) => item.id === input.entityId);
  const ad = ads.value.find((item) => item.id === input.entityId);
  const found = campaign
    ? { level: "campaign" as const, name: campaign.name, status: campaign.status }
    : adSet
      ? { level: "adset" as const, name: adSet.name, status: adSet.status }
      : ad
        ? { level: "ad" as const, name: ad.name, status: ad.status }
        : null;
  if (!found) {
    return err(new AppError(ErrorCode.NOT_FOUND, { message: "Bu kimlikte kampanya, reklam seti ya da reklam yok. get_ads_overview çıktısındaki id'yi kullan." }));
  }

  const holders = buildBudgetHolders(campaigns.value, adSets.value);
  const holder = holders.find((item) => item.id === input.entityId) ?? null;
  const projection = projectCommittedDaily(campaigns.value, adSets.value, { level: found.level, id: input.entityId }, input.to);

  const verdict = checkStatusChange({
    settings,
    changesToday: changesToday.value,
    target: {
      name: found.name,
      status: found.status === "ACTIVE" || found.status === "PAUSED" ? found.status : "OTHER",
      lifetimeBudget: holder !== null && holder.dailyBudgetMinor === null,
    },
    to: input.to,
    committedBeforeMinor: projection.before,
    committedAfterMinor: projection.after,
  });
  if (!verdict.allowed) return refused(verdict);

  const written = await updateStatus(config, input.entityId, input.to);
  if (!written.ok) return written;

  const budget = holder?.dailyBudgetMinor ?? null;
  const logged = await insertAdsChange({
    entityId: input.entityId,
    entityLevel: found.level,
    entityName: found.name,
    action: input.to === "ACTIVE" ? "resume" : "pause",
    beforeDailyBudgetMinor: budget,
    afterDailyBudgetMinor: budget,
    reason: input.reason,
    source: input.source,
    actorId: context.value.actorId,
  });

  return ok({
    id: input.entityId,
    level: found.level,
    name: found.name,
    beforeDailyBudgetMinor: budget,
    afterDailyBudgetMinor: budget,
    status: input.to,
    committedDailyMinor: projection.after,
    dailyCapMinor: settings.dailyCapMinor,
    ...(logged.ok ? {} : { warning: LOG_WARNING }),
  });
}
