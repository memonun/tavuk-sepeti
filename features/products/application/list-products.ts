import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { Product, ProductUnit } from "@/features/products/domain/product";
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
  "key, display_name, unit, unit_label, package_size, min_qty, step, current_unit_price_minor, active, fulfillment_type";

/**
 * Load every product's volume tiers, grouped by product key. Tiers live in
 * `product_price_tiers` (not in the generated Database type yet) — degrades to
 * "no tiers" (flat base price) when the table is unavailable pre-migration.
 */
async function loadTiersByProduct(): Promise<Map<string, ProductPriceTier[]>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tiersRes = await (supabase as any)
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
  for (const t of (tiersRes.data ?? []) as Array<{
    product_key: string;
    min_qty: number | string;
    unit_price_minor: number | string;
  }>) {
    const list = tiersByProduct.get(t.product_key) ?? [];
    list.push({
      min_qty: Number(t.min_qty),
      unit_price_minor: Number(t.unit_price_minor),
    });
    tiersByProduct.set(t.product_key, list);
  }
  return tiersByProduct;
}

interface ProductRow {
  key: string;
  display_name: string;
  unit: string;
  unit_label: string;
  package_size: number | string;
  min_qty: number | string;
  step: number | string;
  current_unit_price_minor: number;
  active: boolean;
  fulfillment_type: string;
}

function toProduct(
  row: ProductRow,
  tiersByProduct: Map<string, ProductPriceTier[]>,
): Product {
  return {
    key: row.key,
    display_name: row.display_name,
    unit: row.unit as ProductUnit,
    unit_label: row.unit_label,
    package_size: Number(row.package_size),
    min_qty: Number(row.min_qty),
    step: Number(row.step),
    current_unit_price_minor: row.current_unit_price_minor,
    price_tiers: (tiersByProduct.get(row.key) ?? []).sort(
      (a, b) => a.min_qty - b.min_qty,
    ),
    active: row.active,
    fulfillment_type:
      row.fulfillment_type === "shipping" ? "shipping" : "delivery",
  };
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
    .order("display_name");

  if (error) {
    logger.error({ code: error.code, message: error.message }, "list_products_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  const tiersByProduct = await loadTiersByProduct();
  return ok((data ?? []).map((row) => toProduct(row as ProductRow, tiersByProduct)));
}

/**
 * Returns the full catalog — active AND archived — for the admin catalog
 * manager. Active products come first, then alphabetical within each group.
 */
export async function listAllProducts(): Promise<
  Result<Product[], ExternalApiError>
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .order("active", { ascending: false })
    .order("display_name");

  if (error) {
    logger.error({ code: error.code, message: error.message }, "list_all_products_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  const tiersByProduct = await loadTiersByProduct();
  return ok((data ?? []).map((row) => toProduct(row as ProductRow, tiersByProduct)));
}
