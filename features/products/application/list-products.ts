import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { Product, ProductUnit } from "@/features/products/domain/product";
import type { ProductPriceTier } from "@/features/products/domain/product-pricing";

// Re-export the domain types + pure pricing as the products feature's public
// API surface — consumers in other features (orders/ui, orders/application)
// import from here rather than crossing the cross-feature-domain boundary.
export type { Product, ProductUnit } from "@/features/products/domain/product";
// Pure pricing helpers live in ./pricing (client-safe, no server-only guard).

/**
 * Returns every active catalog item (with its volume tiers), in a stable
 * display order.
 *
 * Tiers come from `product_price_tiers`, which isn't in the generated
 * Database type yet (added by a later migration) — so that read uses the
 * un-generated-table cast pattern and degrades to "no tiers" (flat base
 * price) if the table isn't present, keeping the app functional pre-migration.
 */
export async function listActiveProducts(): Promise<
  Result<Product[], ExternalApiError>
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "key, display_name, unit, unit_label, package_size, min_qty, step, current_unit_price_minor, active",
    )
    .eq("active", true)
    .order("display_name");

  if (error) {
    logger.error({ code: error.code, message: error.message }, "list_products_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

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
  } else {
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
  }

  return ok(
    (data ?? []).map((row) => ({
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
    })),
  );
}
