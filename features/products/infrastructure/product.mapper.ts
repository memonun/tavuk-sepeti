import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { Product } from "@/features/products/domain/product";
import type { ProductPriceTier } from "@/features/products/domain/product-pricing";
import {
  fulfillmentTypeSchema,
  productUnitSchema,
  productWebSlugSchema,
} from "@/features/products/domain/product.schema";
import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

const productRowSchema = z.object({
  key: z.string().min(1),
  display_name: z.string(),
  web_slug: productWebSlugSchema.nullable(),
  unit: productUnitSchema,
  unit_label: z.string(),
  package_size: z.coerce.number().positive(),
  min_qty: z.coerce.number().positive(),
  step: z.coerce.number().positive(),
  current_unit_price_minor: z.coerce.number().nonnegative(),
  active: z.boolean(),
  fulfillment_type: fulfillmentTypeSchema,
  is_web_visible: z.boolean().nullable(),
  is_featured: z.boolean().nullable(),
  web_description: z.string().nullable(),
  image_path: z.string().nullable(),
  image_alt: z.string().nullable(),
  sort_order: z.coerce.number(),
  total_quantity_sold: z.coerce.number().optional(),
});

/** Validate DB rows before they enter the product domain. */
export function mapProductRows(
  rows: unknown,
  tiersByProduct: ReadonlyMap<string, readonly ProductPriceTier[]>,
): Result<Product[], ExternalApiError> {
  const parsed = z.array(productRowSchema).safeParse(rows);
  if (!parsed.success) {
    const correlationId = randomUUID();
    logger.error(
      { correlationId, issueCount: parsed.error.issues.length },
      "invalid_product_rows",
    );
    return err(
      new ExternalApiError({
        message: "Ürün verileri doğrulanamadı.",
        correlationId,
      }),
    );
  }
  return ok(
    parsed.data.map((row) => ({
      ...row,
      is_web_visible: row.is_web_visible ?? true,
      is_featured: row.is_featured ?? false,
      price_tiers: [...(tiersByProduct.get(row.key) ?? [])].sort(
        (a, b) => a.min_qty - b.min_qty,
      ),
      total_quantity_sold: row.total_quantity_sold ?? 0,
    })),
  );
}
