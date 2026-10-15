import "server-only";

import { productWebSlugSchema } from "@/features/products/application/product-web-slug";
import {
  getStorefrontCatalog,
  type Product,
} from "@/features/storefront/application/get-catalog";
import { ValidationError, type AppError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

/** Reuse the request-cached catalog and its visibility/pricing rules. */
export async function getStorefrontProductBySlug(
  slug: string,
): Promise<Result<Product | null, AppError>> {
  const parsed = productWebSlugSchema.safeParse(slug);
  if (!parsed.success)
    return err(new ValidationError({ message: "Geçersiz ürün web adresi." }));
  const catalog = await getStorefrontCatalog();
  if (!catalog.ok) return err(catalog.error);
  return ok(
    catalog.value.find((product) => product.web_slug === parsed.data) ?? null,
  );
}
