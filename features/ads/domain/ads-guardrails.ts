/**
 * Spending guardrails for Meta ad automation — the rules a budget or status
 * change must pass before the server calls Meta. Pure, so every branch is
 * unit-tested; the application layer feeds it FRESH state read from Meta and
 * the settings row right before each write.
 *
 * Model. A "budget holder" is whatever carries the daily budget in Meta:
 *   - a campaign with a campaign-level budget (Advantage campaign budget), or
 *   - an ad set, when its campaign has no budget of its own.
 * Automation only acts on budget holders, and only on DAILY budgets. A
 * lifetime-budget holder has no daily figure to cap, so it is reported but
 * never changed, paused or resumed by automation, and it is not part of the
 * committed total.
 *
 * "Committed" = the sum of daily budgets of holders that are delivering
 * (configured ACTIVE, and for an ad set its campaign ACTIVE too). That sum may
 * not exceed the owner's cap after an increase or a resume. Decreases and
 * pauses only lower spending, so the cap never blocks them — even when the
 * account is already over the cap (e.g. after a manual change in Meta).
 *
 * Meta may spend up to ~75% over a daily budget on a single day and balance it
 * over the week; the cap limits budgets, which is what the API controls.
 */
import type { AdsSettings } from "./ads-settings";

export interface BudgetHolder {
  readonly id: string;
  readonly level: "campaign" | "adset";
  readonly name: string;
  /** Configured ACTIVE (and, for an ad set, its campaign configured ACTIVE). */
  readonly delivering: boolean;
  /** Configured status of this holder itself. */
  readonly status: "ACTIVE" | "PAUSED" | "OTHER";
  /** Kuruş. null when the holder runs on a lifetime budget. */
  readonly dailyBudgetMinor: number | null;
  readonly lifetimeBudgetMinor: number | null;
}

export type GuardrailVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

const ALLOWED: GuardrailVerdict = { allowed: true };
const refuse = (reason: string): GuardrailVerdict => ({ allowed: false, reason });

const tl = (minor: number): string =>
  `${(minor / 100).toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₺`;

/** Sum of daily budgets currently delivering (kuruş). */
export function committedDailyMinor(holders: readonly BudgetHolder[]): number {
  return holders.reduce(
    (sum, holder) => sum + (holder.delivering && holder.dailyBudgetMinor !== null ? holder.dailyBudgetMinor : 0),
    0,
  );
}

/** The highest budget one change may set, given the per-change increase limit. */
export function maxIncreasedBudgetMinor(currentMinor: number, maxIncreasePct: number): number {
  return Math.floor((currentMinor * (100 + maxIncreasePct)) / 100);
}

interface CommonInput {
  readonly settings: AdsSettings;
  readonly holders: readonly BudgetHolder[];
  readonly targetId: string;
  /** Changes already logged for this holder today (Istanbul day). */
  readonly changesToday: number;
}

function commonChecks({ settings, holders, targetId, changesToday }: CommonInput):
  | { readonly verdict: GuardrailVerdict; readonly target?: undefined }
  | { readonly verdict: null; readonly target: BudgetHolder } {
  if (!settings.automationEnabled) {
    return { verdict: refuse("Reklam otomasyonu kapalı. /reklam sayfasından açılabilir.") };
  }
  const target = holders.find((holder) => holder.id === targetId);
  if (!target) {
    return {
      verdict: refuse(
        "Bu kimlikte bütçe taşıyan bir kampanya veya reklam seti yok. get_ads_overview çıktısındaki id'yi kullan.",
      ),
    };
  }
  if (target.dailyBudgetMinor === null) {
    return { verdict: refuse(`"${target.name}" toplam (lifetime) bütçeyle çalışıyor; otomasyon buna dokunmaz.`) };
  }
  if (changesToday >= settings.maxChangesPerEntityPerDay) {
    return {
      verdict: refuse(
        `"${target.name}" için bugünkü değişiklik hakkı doldu (günde en fazla ${settings.maxChangesPerEntityPerDay}). Yarın tekrar dene.`,
      ),
    };
  }
  return { verdict: null, target };
}

export function checkBudgetChange(input: CommonInput & { readonly newDailyBudgetMinor: number }): GuardrailVerdict {
  const { verdict, target } = commonChecks(input);
  if (verdict) return verdict;

  const { settings, holders, newDailyBudgetMinor } = input;
  const current = target.dailyBudgetMinor!;

  if (!Number.isInteger(newDailyBudgetMinor) || newDailyBudgetMinor <= 0) {
    return refuse("Yeni günlük bütçe 0'dan büyük olmalı. Durdurmak için set_ad_status kullan.");
  }
  if (newDailyBudgetMinor === current) {
    return refuse(`"${target.name}" günlük bütçesi zaten ${tl(current)}.`);
  }
  if (newDailyBudgetMinor < current) return ALLOWED;

  const ceiling = maxIncreasedBudgetMinor(current, settings.maxIncreasePct);
  if (newDailyBudgetMinor > ceiling) {
    return refuse(
      `Tek seferde en fazla %${settings.maxIncreasePct} artış yapılabilir: "${target.name}" için en fazla ${tl(ceiling)}.`,
    );
  }
  if (target.delivering) {
    const projected = committedDailyMinor(holders) - current + newDailyBudgetMinor;
    if (projected > settings.dailyCapMinor) {
      const headroom = Math.max(0, settings.dailyCapMinor - (committedDailyMinor(holders) - current));
      return refuse(
        `Günlük toplam tavan ${tl(settings.dailyCapMinor)}. Bu değişiklikle toplam ${tl(projected)} olurdu; "${target.name}" en fazla ${tl(headroom)} olabilir.`,
      );
    }
  }
  return ALLOWED;
}

/**
 * Switching a campaign, ad set or ad on or off. The caller projects the
 * committed total before and after this exact change (meta-ads.ts
 * `projectCommittedDaily`), so turning on a campaign whose ad sets carry the
 * budget is checked as well as turning on a budget holder itself. Ads carry no
 * budget: their before and after are equal.
 */
export function checkStatusChange(input: {
  readonly settings: AdsSettings;
  readonly changesToday: number;
  readonly target: { readonly name: string; readonly status: BudgetHolder["status"]; readonly lifetimeBudget: boolean };
  readonly to: "ACTIVE" | "PAUSED";
  readonly committedBeforeMinor: number;
  readonly committedAfterMinor: number;
}): GuardrailVerdict {
  const { settings, changesToday, target, to, committedBeforeMinor, committedAfterMinor } = input;
  if (!settings.automationEnabled) {
    return refuse("Reklam otomasyonu kapalı. /reklam sayfasından açılabilir.");
  }
  if (target.lifetimeBudget) {
    return refuse(`"${target.name}" toplam (lifetime) bütçeyle çalışıyor; otomasyon buna dokunmaz.`);
  }
  if (changesToday >= settings.maxChangesPerEntityPerDay) {
    return refuse(
      `"${target.name}" için bugünkü değişiklik hakkı doldu (günde en fazla ${settings.maxChangesPerEntityPerDay}). Yarın tekrar dene.`,
    );
  }
  if (to === target.status) {
    return refuse(`"${target.name}" zaten ${to === "ACTIVE" ? "açık" : "durdurulmuş"}.`);
  }
  if (to === "PAUSED") return ALLOWED;

  if (committedAfterMinor > committedBeforeMinor && committedAfterMinor > settings.dailyCapMinor) {
    return refuse(
      `Günlük toplam tavan ${tl(settings.dailyCapMinor)}. "${target.name}" açılırsa toplam ${tl(committedAfterMinor)} olurdu. Önce bir bütçeyi düşür ya da başka bir reklamı durdur.`,
    );
  }
  return ALLOWED;
}

/**
 * New campaigns, ad sets and ads are always created PAUSED in Meta, so
 * creating one never spends: it starts only through `checkStatusChange`'s cap
 * check. This guard only keeps a runaway loop from filling the account.
 */
export const MAX_CREATIONS_PER_DAY = 10;

export function checkCreation(input: {
  readonly settings: AdsSettings;
  /** Campaigns + ad sets + ads created today (Istanbul day). */
  readonly creationsToday: number;
  /** Kuruş; only for a budget-carrying campaign or ad set. */
  readonly initialDailyBudgetMinor?: number;
}): GuardrailVerdict {
  const { settings, creationsToday, initialDailyBudgetMinor } = input;
  if (!settings.automationEnabled) {
    return refuse("Reklam otomasyonu kapalı. /reklam sayfasından açılabilir.");
  }
  if (creationsToday >= MAX_CREATIONS_PER_DAY) {
    return refuse(`Bugün en fazla ${MAX_CREATIONS_PER_DAY} kampanya / reklam seti / reklam açılabilir. Yarın tekrar dene.`);
  }
  if (initialDailyBudgetMinor !== undefined) {
    if (!Number.isInteger(initialDailyBudgetMinor) || initialDailyBudgetMinor <= 0) {
      return refuse("Günlük bütçe 0'dan büyük olmalı.");
    }
    if (initialDailyBudgetMinor > settings.dailyCapMinor) {
      return refuse(`Günlük bütçe, günlük toplam tavanı (${tl(settings.dailyCapMinor)}) aşamaz.`);
    }
  }
  return ALLOWED;
}
