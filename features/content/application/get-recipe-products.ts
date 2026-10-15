import "server-only";

import { getStorefrontProductBySlug } from "@/features/storefront/application/get-product-by-slug";
import type { Product } from "@/features/storefront/application/get-catalog";
import type { AppError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";
import type { Recipe } from "../domain/recipe";

/** All lookups reuse the request-cached storefront catalog; no per-slug DB I/O. */
export async function getRecipeProducts(
  recipe: Pick<Recipe, "productSlugs">,
): Promise<Result<Product[], AppError>> {
  const results = await Promise.all(
    [...new Set(recipe.productSlugs)].map((slug) =>
      getStorefrontProductBySlug(slug),
    ),
  );
  const products: Product[] = [];
  for (const result of results) {
    if (!result.ok) return err(result.error);
    if (result.value) products.push(result.value);
  }
  return ok(products);
}
