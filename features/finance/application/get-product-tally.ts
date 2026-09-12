import "server-only";

/**
 * Ürün Çetelesi report — same query shape as get-finance-summary.ts
 * (financeSummaryQuerySchema), reused as-is rather than duplicating the
 * from/to/dateBasis validation.
 */
import { buildProductTallyRows, type ProductTallyRow } from "@/features/finance/domain/product-tally";
import { financeSummaryQuerySchema } from "@/features/finance/domain/finance-query.schema";
import { fetchProductTallyRows } from "@/features/finance/infrastructure/product-tally.repository";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { AppError, ValidationError } from "@/shared/errors/app-error";

export async function getProductTally(
  rawQuery: unknown,
): Promise<Result<ProductTallyRow[], AppError>> {
  const parsed = financeSummaryQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.flatten() }, "get_product_tally_invalid_query");
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz dönem.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const { from, to, dateBasis } = parsed.data;
  const rowsResult = await fetchProductTallyRows(from, to, dateBasis);
  if (!rowsResult.ok) return err(rowsResult.error);

  return ok(buildProductTallyRows(rowsResult.value));
}
