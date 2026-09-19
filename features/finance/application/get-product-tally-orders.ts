import "server-only";

import { financeSummaryQuerySchema } from "@/features/finance/domain/finance-query.schema";
import type { ProductOrdersPage } from "@/features/finance/domain/product-tally-orders";
import { fetchProductOrders } from "@/features/finance/infrastructure/product-tally-orders.repository";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, type Result } from "@/shared/result";
import { z } from "zod";

const querySchema = financeSummaryQuerySchema.and(
  z.object({
    productKey: z.string().min(1).max(100),
    kind: z.enum(["sold", "gift"]),
    page: z.number().int().min(1).default(1),
  }),
);

/** Orders a product was sold/gifted in, for the Ürün Çetelesi period. */
export async function getProductTallyOrders(
  rawQuery: unknown,
): Promise<Result<ProductOrdersPage, AppError>> {
  const parsed = querySchema.safeParse(rawQuery);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.flatten() }, "get_product_tally_orders_invalid_query");
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz sorgu.",
        details: parsed.error.flatten(),
      }),
    );
  }
  return fetchProductOrders(parsed.data);
}
