import "server-only";

/**
 * Storefront catalog read. Reuses the products feature's public API
 * (`listActiveProducts`) — no new DB access, one source of truth for the
 * catalog + its volume tiers.
 *
 * Storefront business rule: only SELLABLE products appear on the shop — a
 * product with no base price and no tiers (e.g. cheese/yogurt before the admin
 * prices them) is hidden so a customer never sees a ₺0,00 item. The moment the
 * admin sets a price, it shows up. Archived products are already excluded by
 * `listActiveProducts`.
 */
import { cache } from "react";

import { listActiveProducts, type Product } from "@/features/products/application/list-products";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import type { ExternalApiError } from "@/shared/errors/app-error";

export type { Product } from "@/features/products/application/list-products";

/**
 * Active, priced products for the public storefront. Wrapped in React `cache`
 * so the layout (header basket) and the page (catalog / checkout summary) share
 * a single DB round-trip per request.
 */
export const getStorefrontCatalog = cache(
  async (): Promise<Result<Product[], ExternalApiError>> => {
    const result = await listActiveProducts();
    if (!result.ok) {
      logger.error({ code: result.error.code }, "storefront_catalog_failed");
      return err(result.error);
    }

    // A product reaches the shop only when it is web-visible AND sellable
    // (a base price or at least one tier — never a ₺0,00 item). Featured
    // products float to the top, stable within each group.
    const sellable = result.value.filter(
      (p) =>
        p.is_web_visible &&
        (p.current_unit_price_minor > 0 || p.price_tiers.length > 0),
    );
    const ordered = [...sellable].sort(
      (a, b) => Number(b.is_featured) - Number(a.is_featured),
    );
    return ok(ordered);
  },
);
