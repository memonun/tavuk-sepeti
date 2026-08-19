import "server-only";

import { getRecentFinancialActivity as repoGetRecentFinancialActivity } from "@/features/finance/infrastructure/recent-activity.repository";
import { AppError } from "@/shared/errors/app-error";
import { err, type Result } from "@/shared/result";

import type { FinancialActivityItem } from "@/features/finance/domain/financial-activity";

export async function getRecentFinancialActivity(): Promise<
  Result<FinancialActivityItem[], AppError>
> {
  const result = await repoGetRecentFinancialActivity();
  if (!result.ok) return err(result.error);
  return result;
}
