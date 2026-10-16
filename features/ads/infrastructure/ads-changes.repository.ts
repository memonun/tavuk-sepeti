import "server-only";

/**
 * The append-only `meta_ads_changes` log: the owner's report, and the counts
 * the guardrails need ("how many times was this touched today").
 */
import { z } from "zod";

import { adsChangeRowSchema, type AdsChangeRow } from "@/features/ads/domain/ads-change";
import { AppError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { istanbulInstant, todayInIstanbul } from "@/shared/utils/date";

/* eslint-disable @typescript-eslint/no-explicit-any */
type LooseClient = { from: (table: string) => any };
/* eslint-enable @typescript-eslint/no-explicit-any */

const TABLE = "meta_ads_changes";

export interface NewAdsChange {
  readonly entityId: string;
  readonly entityLevel: "campaign" | "adset" | "ad";
  readonly entityName: string;
  readonly action: "budget" | "pause" | "resume" | "create";
  readonly beforeDailyBudgetMinor: number | null;
  readonly afterDailyBudgetMinor: number | null;
  readonly reason: string;
  readonly source: "mcp" | "panel";
  readonly actorId: string;
}

export type { AdsChangeRow };

const COLUMNS =
  "id, entity_id, entity_level, entity_name, action, before_daily_budget_minor, after_daily_budget_minor, reason, source, created_at";

const dbError = (message: string, cause: unknown) => new AppError(ErrorCode.DATABASE_ERROR, { message, cause });

export async function insertAdsChange(change: NewAdsChange): Promise<Result<void, AppError>> {
  const supabase = (await createSupabaseServerClient()) as unknown as LooseClient;
  const { error } = await supabase.from(TABLE).insert({
    entity_id: change.entityId,
    entity_level: change.entityLevel,
    entity_name: change.entityName.slice(0, 400),
    action: change.action,
    before_daily_budget_minor: change.beforeDailyBudgetMinor,
    after_daily_budget_minor: change.afterDailyBudgetMinor,
    reason: change.reason.slice(0, 1000),
    source: change.source,
    actor_id: change.actorId,
  });
  if (error) {
    logger.error({ code: error.code, message: error.message, entityId: change.entityId }, "meta_ads_change_log_failed");
    return err(dbError("Değişiklik kaydı yazılamadı.", error));
  }
  return ok(undefined);
}

/** Start of the current Istanbul day — the "today" every daily limit counts in. */
function istanbulDayStartIso(): string {
  return istanbulInstant(todayInIstanbul()).toISOString();
}

/** Non-create changes logged for one holder today. Fails closed: an error
 *  reports the limit as already used, so a DB blip never lets changes through. */
export async function countChangesToday(entityId: string): Promise<Result<number, AppError>> {
  const supabase = (await createSupabaseServerClient()) as unknown as LooseClient;
  const { count, error } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("entity_id", entityId)
    .neq("action", "create")
    .gte("created_at", istanbulDayStartIso());
  if (error || count === null) {
    logger.error({ code: error?.code, entityId }, "meta_ads_change_count_failed");
    return err(dbError("Bugünkü değişiklik sayısı okunamadı; güvenlik için işlem yapılmadı.", error));
  }
  return ok(count);
}

export async function countCreationsToday(): Promise<Result<number, AppError>> {
  const supabase = (await createSupabaseServerClient()) as unknown as LooseClient;
  const { count, error } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("action", "create")
    .gte("created_at", istanbulDayStartIso());
  if (error || count === null) {
    logger.error({ code: error?.code }, "meta_ads_creation_count_failed");
    return err(dbError("Bugün açılanların sayısı okunamadı; güvenlik için işlem yapılmadı.", error));
  }
  return ok(count);
}

/** Newest first; paginated (CLAUDE.md §9: default 25, max 100). */
export async function listAdsChanges(opts: { readonly limit?: number; readonly sinceIso?: string } = {}): Promise<Result<AdsChangeRow[], AppError>> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const supabase = (await createSupabaseServerClient()) as unknown as LooseClient;
  let query = supabase.from(TABLE).select(COLUMNS).order("created_at", { ascending: false }).limit(limit);
  if (opts.sinceIso) query = query.gte("created_at", opts.sinceIso);
  const { data, error } = await query;
  if (error) {
    logger.error({ code: error.code }, "meta_ads_change_list_failed");
    return err(dbError("Değişiklik geçmişi okunamadı.", error));
  }
  const rows = z.array(adsChangeRowSchema).safeParse(data ?? []);
  if (!rows.success) {
    logger.error({ issues: rows.error.issues.map((issue) => issue.path.join(".")) }, "meta_ads_change_rows_invalid");
    return err(dbError("Değişiklik geçmişi okunamadı.", null));
  }
  return ok(rows.data);
}
