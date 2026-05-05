import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { Product, ProductUnit } from "@/features/products/domain/product";

// Re-export the domain types as part of the products feature's public API
// surface — consumers in other features (orders/ui, etc.) import from here
// rather than crossing the cross-feature-domain boundary directly.
export type { Product, ProductUnit } from "@/features/products/domain/product";

/**
 * Returns every active catalog item, in a stable display order.
 *
 * Faz 1 keeps the catalog small (4 SKUs) and admin-edited via the dashboard.
 * No pagination needed — full read every time.
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
      active: row.active,
    })),
  );
}
