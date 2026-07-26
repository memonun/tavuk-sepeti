import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { ProductPriceTier } from "@/features/products/domain/product-pricing";
import type { ProductMetadata } from "@/features/products/domain/product.schema";
import { slugifyProductKey } from "@/features/products/domain/product-key";

/** Postgres unique-violation SQLSTATE — a key collision on insert. */
const PG_UNIQUE_VIOLATION = "23505";
/** How many slug variants to try before falling back to a random suffix. */
const MAX_KEY_ATTEMPTS = 6;

export interface CreateProductInput extends ProductMetadata {
  /** Starting base price in kuruş. */
  readonly base_price_minor: number;
}

/**
 * Insert a new catalog product. The PK `key` is derived from the display name
 * (slugified) and made unique by suffixing on collision: `koy-yumurtasi`,
 * `koy-yumurtasi-2`, … On the final attempt a short random suffix defeats a
 * concurrent-insert race. Returns the key that was actually persisted.
 */
export async function createProduct(
  input: CreateProductInput,
): Promise<Result<string, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const base = slugifyProductKey(input.display_name);
  const now = new Date().toISOString();

  for (let attempt = 1; attempt <= MAX_KEY_ATTEMPTS; attempt += 1) {
    let candidate: string;
    if (attempt === 1) {
      candidate = base;
    } else if (attempt < MAX_KEY_ATTEMPTS) {
      candidate = `${base}-${attempt}`;
    } else {
      // Final attempt: random suffix so a busy collision still resolves.
      candidate = `${base}-${Math.random().toString(36).slice(2, 7)}`;
    }

    const { error } = await supabase.from("products").insert({
      key: candidate,
      display_name: input.display_name,
      unit: input.unit,
      unit_label: input.unit_label,
      package_size: input.package_size,
      min_qty: input.min_qty,
      step: input.step,
      fulfillment_type: input.fulfillment_type,
      current_unit_price_minor: input.base_price_minor,
      created_at: now,
      updated_at: now,
    });

    if (!error) return ok(candidate);

    if (error.code === PG_UNIQUE_VIOLATION) {
      // Key taken — try the next variant.
      continue;
    }

    logger.error(
      { code: error.code, message: error.message },
      "create_product_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  logger.error({ base }, "create_product_key_exhausted");
  return err(
    new ExternalApiError({
      message: "Benzersiz bir ürün anahtarı üretilemedi.",
    }),
  );
}

/** Update a product's editable content fields (not key, not price/tiers). */
export async function updateProductMetadata(
  productKey: string,
  fields: ProductMetadata,
): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("products")
    .update({
      display_name: fields.display_name,
      unit: fields.unit,
      unit_label: fields.unit_label,
      package_size: fields.package_size,
      min_qty: fields.min_qty,
      step: fields.step,
      fulfillment_type: fields.fulfillment_type,
      updated_at: new Date().toISOString(),
    })
    .eq("key", productKey);
  if (error) {
    logger.error(
      { productKey, code: error.code },
      "update_product_metadata_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}

/** Archive (active=false) or restore (active=true) a product. */
export async function setProductActive(
  productKey: string,
  active: boolean,
): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("products")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("key", productKey);
  if (error) {
    logger.error(
      { productKey, active, code: error.code },
      "set_product_active_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}

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
