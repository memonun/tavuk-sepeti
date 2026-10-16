import "server-only";

/**
 * Meta ad management configuration, read lazily from the server environment.
 *
 * Deliberately NOT in shared/env.ts: that module validates at boot and throws,
 * so a typo in an ad-account id would take the whole shop down. Here a missing
 * or malformed value only means "ads not configured" — the ad tools say so and
 * touch nothing (same reasoning as shared/analytics/meta-pixel-config.ts).
 *
 *   META_ADS_ACCESS_TOKEN   system-user token with ads_management (SECRET:
 *                           it can spend money; server-only, never NEXT_PUBLIC)
 *   META_AD_ACCOUNT_ID      act_123… or just the digits
 *   META_PAGE_ID            Facebook Page the ads run as (needed to create ads)
 *   META_INSTAGRAM_USER_ID  optional; ads also run on that Instagram account
 *   META_GRAPH_API_VERSION  optional; defaults to v26.0
 */
import { z } from "zod";

import { logger } from "@/shared/logger";

const digits = z.string().trim().regex(/^\d{1,32}$/);

const configSchema = z.object({
  accessToken: z.string().trim().min(20),
  adAccountId: z
    .string()
    .trim()
    .regex(/^(act_)?\d{1,32}$/)
    .transform((value) => (value.startsWith("act_") ? value : `act_${value}`)),
  pageId: digits.optional(),
  instagramUserId: digits.optional(),
  apiVersion: z.string().trim().regex(/^v\d+\.\d+$/).default("v26.0"),
});

export type MetaAdsConfig = z.infer<typeof configSchema>;

const blank = (value: string | undefined) => (value && value.trim() !== "" ? value : undefined);

/** null = not configured (or malformed — logged once per call, without values). */
export function getMetaAdsConfig(): MetaAdsConfig | null {
  const raw = {
    accessToken: blank(process.env.META_ADS_ACCESS_TOKEN),
    adAccountId: blank(process.env.META_AD_ACCOUNT_ID),
    pageId: blank(process.env.META_PAGE_ID),
    instagramUserId: blank(process.env.META_INSTAGRAM_USER_ID),
    apiVersion: blank(process.env.META_GRAPH_API_VERSION),
  };
  if (!raw.accessToken && !raw.adAccountId) return null;

  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    // Field names only — never the token.
    logger.error({ fields: parsed.error.issues.map((issue) => issue.path.join(".")) }, "meta_ads_config_invalid");
    return null;
  }
  return parsed.data;
}
