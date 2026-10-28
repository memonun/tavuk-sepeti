import "server-only";

/**
 * Ürün satışları ay ay — one call for up to 24 whole months. Same counting
 * rule as getProductTally (non-cancelled orders, sold and gifted apart).
 */
import { productTallyByMonthQuerySchema } from "@/features/finance/domain/finance-query.schema";
import {
  buildMonthlyProductTally,
  monthRangeDays,
  type ProductMonthTally,
} from "@/features/finance/domain/product-tally";
import { fetchProductTallyByMonthRows } from "@/features/finance/infrastructure/product-tally.repository";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

export async function getProductTallyByMonth(
  rawQuery: unknown,
): Promise<Result<ProductMonthTally[], AppError>> {
  const parsed = productTallyByMonthQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.flatten() }, "get_product_tally_by_month_invalid_query");
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz dönem.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const { from_month, to_month, dateBasis } = parsed.data;
  const { from, to } = monthRangeDays(from_month, to_month);
  const rows = await fetchProductTallyByMonthRows(from, to, dateBasis);
  if (!rows.ok) return err(rows.error);

  return ok(buildMonthlyProductTally(from_month, to_month, rows.value));
}
