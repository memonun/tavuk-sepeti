import "server-only";

/**
 * Shared preconditions for every ad operation: an admin caller, a configured
 * Meta connection, and an ad account that is active and billed in TRY (the
 * limits are lira; a budget in another currency would be read 1:1 as kuruş).
 */
import { assertAdmin } from "@/features/auth/application/assert-admin";
import { META_ACCOUNT_ACTIVE, type MetaAccount } from "@/features/ads/domain/meta-ads";
import { getMetaAdsConfig, type MetaAdsConfig } from "@/features/ads/infrastructure/meta-ads-config";
import { fetchAccount } from "@/features/ads/infrastructure/meta-ads.repository";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";
import { err, ok, type Result } from "@/shared/result";

export interface AdsContext {
  readonly actorId: string;
  readonly config: MetaAdsConfig;
  readonly account: MetaAccount;
}

export const NOT_CONFIGURED_MESSAGE =
  "Meta reklam bağlantısı kurulmamış. Vercel'de META_ADS_ACCESS_TOKEN ve META_AD_ACCOUNT_ID tanımlanmalı (docs/meta-reklam-kurulumu.md).";

export async function loadAdsContext(): Promise<Result<AdsContext, AppError>> {
  const admin = await assertAdmin();
  if (!admin.ok) return admin;

  const config = getMetaAdsConfig();
  if (!config) return err(new AppError(ErrorCode.BUSINESS_RULE_VIOLATION, { message: NOT_CONFIGURED_MESSAGE }));

  const account = await fetchAccount(config);
  if (!account.ok) return account;
  if (account.value.currency !== "TRY") {
    return err(
      new ValidationError({
        message: `Reklam hesabının para birimi ${account.value.currency}. Limitler ₺ cinsinden olduğu için sadece TRY hesaplar yönetilir.`,
      }),
    );
  }
  if (account.value.account_status !== META_ACCOUNT_ACTIVE) {
    return err(
      new AppError(ErrorCode.BUSINESS_RULE_VIOLATION, {
        message: "Meta reklam hesabı aktif değil (ödeme sorunu, inceleme ya da kapatılmış olabilir). Reklam Yöneticisi'nden kontrol edin.",
      }),
    );
  }
  return ok({ actorId: admin.value.id, config, account: account.value });
}
