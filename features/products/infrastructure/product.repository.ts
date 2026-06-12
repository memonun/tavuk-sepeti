import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { ProductPriceTier } from "@/features/products/domain/product-pricing";

/** Update a product's flat/base unit price (kuruş). */
export async function updateProductBasePrice(
  productKey: string,
  basePriceMinor: number,
): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("products")
    .update({ current_unit_price_minor: basePriceMinor, updated_at: new Date().toISOString() })
    .eq("key", productKey);
  if (error) {
    logger.error({ productKey, code: error.code }, "update_product_base_price_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}

/**
 * Replace a product's volume tiers with the given set. Upserts the provided
 * rows, then deletes any stale tiers for that product whose min_qty is no
 * longer present — so there's never a window where the product has zero tiers.
 *
 * `product_price_tiers` isn't in the generated Database type yet, so this uses
 * the un-generated-table cast pattern used elsewhere in the codebase.
 */
export async function replaceProductTiers(
  productKey: string,
  tiers: ReadonlyArray<ProductPriceTier>,
): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();

  if (tiers.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upsertError } = await (supabase as any)
      .from("product_price_tiers")
      .upsert(
        tiers.map((t) => ({
          product_key: productKey,
          min_qty: t.min_qty,
          unit_price_minor: t.unit_price_minor,
          updated_at: now,
        })),
        { onConflict: "product_key,min_qty" },
      );
    if (upsertError) {
      logger.error({ productKey, code: upsertError.code }, "upsert_product_tiers_failed");
      return err(new ExternalApiError({ message: upsertError.message, cause: upsertError }));
    }
  }

  // Drop tiers that are no longer in the set.
  const keepMins = tiers.map((t) => t.min_qty);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let del = (supabase as any)
    .from("product_price_tiers")
    .delete()
    .eq("product_key", productKey);
  if (keepMins.length > 0) {
    del = del.not("min_qty", "in", `(${keepMins.join(",")})`);
  }
  const { error: deleteError } = await del;
  if (deleteError) {
    logger.error({ productKey, code: deleteError.code }, "prune_product_tiers_failed");
    return err(new ExternalApiError({ message: deleteError.message, cause: deleteError }));
  }

  return ok(undefined);
}
