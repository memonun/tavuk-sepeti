import "server-only";

/**
 * What /reklam shows: whether the Meta connection is set up (no network call,
 * no secret values), the limits, and the latest changes.
 */
import { assertAdmin } from "@/features/auth/application/assert-admin";
import type { AdsSettings } from "@/features/ads/domain/ads-settings";
import { listAdsChanges, type AdsChangeRow } from "@/features/ads/infrastructure/ads-changes.repository";
import { fetchAdsSettings } from "@/features/ads/infrastructure/ads-settings.repository";
import { getMetaAdsConfig } from "@/features/ads/infrastructure/meta-ads-config";
import { getMetaPixelId } from "@/shared/analytics/meta-pixel-config";
import type { AppError } from "@/shared/errors/app-error";
import { ok, type Result } from "@/shared/result";

export interface AdsPageData {
  readonly connection: {
    readonly configured: boolean;
    readonly page: boolean;
    readonly instagram: boolean;
    readonly pixel: boolean;
  };
  readonly settings: AdsSettings;
  readonly changes: readonly AdsChangeRow[];
  /** Set when the history could not be read; the rest of the page still works. */
  readonly changesError: string | null;
}

export async function getAdsPageData(): Promise<Result<AdsPageData, AppError>> {
  const admin = await assertAdmin();
  if (!admin.ok) return admin;

  const config = getMetaAdsConfig();
  const [settings, changes] = await Promise.all([fetchAdsSettings(), listAdsChanges({ limit: 50 })]);
  return ok({
    connection: {
      configured: config !== null,
      page: Boolean(config?.pageId),
      instagram: Boolean(config?.instagramUserId),
      pixel: getMetaPixelId() !== null,
    },
    settings,
    changes: changes.ok ? changes.value : [],
    changesError: changes.ok ? null : changes.error.message,
  });
}
