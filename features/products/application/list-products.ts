import "server-only";

import { z } from "zod";
import { mapProductRows } from "@/features/products/infrastructure/product.mapper";
import { productWebSlugSchema } from "@/features/products/domain/product.schema";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger, newCorrelationId } from "@/shared/logger";
import { err, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { Product } from "@/features/products/domain/product";
import type { ProductPriceTier } from "@/features/products/domain/product-pricing";

// Re-export the domain types as the products feature's public API surface.
export type {
  FulfillmentType,
  Product,
  ProductUnit,
} from "@/features/products/domain/product";
// Pure pricing helpers live in ./pricing (client-safe, no server-only guard).
//
// NOTE: caching this catalog (it's global + read-heavy, re-fetched on every
// order/payment refresh) is a real win but needs the Next 16 `"use cache"` +
// cacheTag/cacheLife model (revalidateTag changed signature in 16.2). Tracked
// as a dedicated follow-up so a stale cache can't ever serve a wrong price.

const PRODUCT_COLUMNS =
  "key, display_name, web_slug, unit, unit_label, package_size, min_qty, step, current_unit_price_minor, active, fulfillment_type, is_web_visible, is_featured, web_description, image_path, image_alt, sort_order";

/**
 * Load every product's volume tiers, grouped by product key. Tiers live in
 * `product_price_tiers` — degrades to
 * "no tiers" (flat base price) when the table is unavailable pre-migration.
 */
async function loadTiersByProduct(): Promise<Map<string, ProductPriceTier[]>> {
  const supabase = await createSupabaseServerClient();
  const tiersRes = await supabase
    .from("product_price_tiers")
    .select("product_key, min_qty, unit_price_minor");

  const tiersByProduct = new Map<string, ProductPriceTier[]>();
  if (tiersRes.error) {
    logger.warn(
      { code: tiersRes.error.code, message: tiersRes.error.message },
      "list_product_tiers_unavailable",
    );
    return tiersByProduct;
  }
  const parsed = z.array(z.object({
    product_key: z.string(),
    min_qty: z.coerce.number().positive(),
    unit_price_minor: z.coerce.number().nonnegative(),
  })).safeParse(tiersRes.data ?? []);
  if (!parsed.success) {
    logger.error({ correlationId: newCorrelationId(), issueCount: parsed.error.issues.length }, "invalid_product_price_tiers");
    return tiersByProduct;
  }
  for (const t of parsed.data) {
    const list = tiersByProduct.get(t.product_key) ?? [];
    list.push({
      min_qty: Number(t.min_qty),
      unit_price_minor: Number(t.unit_price_minor),
    });
    tiersByProduct.set(t.product_key, list);
  }
  return tiersByProduct;
}

/**
 * Returns every active catalog item (with its volume tiers), in a stable
 * display order. Used by the order forms (item selection).
 */
export async function listActiveProducts(): Promise<
  Result<Product[], ExternalApiError>
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("active", true)
    .order("sort_order")
    .order("display_name");

  if (error) {
    logger.error({ code: error.code, message: error.message }, "list_products_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  const tiersByProduct = await loadTiersByProduct();
  return mapProductRows(data ?? [], tiersByProduct);
}

/**
 * Returns the full catalog — active AND archived — for the admin catalog
 * manager. Active products come first, then alphabetical within each group.
 */
export async function listAllProducts(): Promise<
  Result<Product[], ExternalApiError>
> {
  const supabase = await createSupabaseServerClient();
  // The RPC returns the catalog already ordered (active first, sort_order,
  // display_name) with total_quantity_sold attached.
  // Keep the existing RPC contract compatible with the previous app release.
  // Slugs are fetched once for the whole admin list, never per product.
  const [{ data, error }, slugResult] = await Promise.all([
    supabase.rpc("list_products_with_sales"),
    supabase.from("products").select("key, web_slug"),
  ]);

  if (error) {
    logger.error({ code: error.code, message: error.message }, "list_all_products_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  if (slugResult.error) {
    const correlationId = newCorrelationId();
    logger.error({ correlationId, code: slugResult.error.code }, "list_product_slugs_failed");
    return err(new ExternalApiError({ message: slugResult.error.message, cause: slugResult.error, correlationId }));
  }
  const slugs = z.array(z.object({ key: z.string(), web_slug: productWebSlugSchema.nullable() }))
    .safeParse(slugResult.data ?? []);
  if (!slugs.success) {
    const correlationId = newCorrelationId();
    logger.error({ correlationId, issueCount: slugs.error.issues.length }, "invalid_product_slugs");
    return err(new ExternalApiError({ message: "Ürün web adresleri doğrulanamadı.", correlationId }));
  }
  const slugByKey = new Map(slugs.data.map((row) => [row.key, row.web_slug]));
  const tiersByProduct = await loadTiersByProduct();
  return mapProductRows((data ?? []).map((row) => ({
    ...row,
    web_slug: slugByKey.get(row.key) ?? null,
  })), tiersByProduct);
}
