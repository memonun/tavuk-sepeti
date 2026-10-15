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
  // Checked per row below: a malformed slug must cost that product its page,
  // never take the whole catalog (shop + admin order forms) down with it.
  web_slug: z.string().nullable(),
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
  // Optional: the admin RPC row predates the column (merged in separately).
  web_long_description: z.string().nullable().optional(),
  image_path: z.string().nullable(),
  image_alt: z.string().nullable(),
  sort_order: z.coerce.number(),
  total_quantity_sold: z.coerce.number().optional(),
});

/**
 * A stored slug that fails the URL rules (written outside the app, e.g. by
 * hand in SQL) is treated as "no page" and logged, instead of failing the row.
 */
function toValidWebSlug(productKey: string, slug: string | null): string | null {
  if (slug === null) return null;
  if (productWebSlugSchema.safeParse(slug).success) return slug;
  logger.warn({ productKey }, "invalid_product_web_slug_ignored");
  return null;
}

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
      web_slug: toValidWebSlug(row.key, row.web_slug),
      web_long_description: row.web_long_description ?? null,
      is_web_visible: row.is_web_visible ?? true,
      is_featured: row.is_featured ?? false,
      price_tiers: [...(tiersByProduct.get(row.key) ?? [])].sort(
        (a, b) => a.min_qty - b.min_qty,
      ),
      total_quantity_sold: row.total_quantity_sold ?? 0,
    })),
  );
}
