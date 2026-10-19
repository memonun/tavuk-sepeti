import "server-only";

/**
 * A product image's bytes for the own-domain image route
 * (app/urun-gorsel/[...path]/route.ts). Only object keys with the shape
 * buildProductImageKey writes are read; anything else is "not found", so the
 * route cannot be turned into a proxy for other Storage objects.
 */
import {
  isProductImagePath,
  productImageMimeForPath,
  type ProductImageMime,
} from "@/features/products/domain/product-image";
import { readPublicProductImageObject } from "@/features/products/infrastructure/product.repository";
import { env } from "@/shared/env";
import type { ExternalApiError } from "@/shared/errors/app-error";
import { ok, type Result } from "@/shared/result";

export interface ProductImageFile {
  readonly body: ArrayBuffer;
  readonly contentType: ProductImageMime;
}

export async function getProductImageFile(
  imagePath: string,
): Promise<Result<ProductImageFile | null, ExternalApiError>> {
  const contentType = productImageMimeForPath(imagePath);
  if (!isProductImagePath(imagePath) || !contentType) return ok(null);
  const body = await readPublicProductImageObject(imagePath, env.NEXT_PUBLIC_SUPABASE_URL);
  if (!body.ok || !body.value) return body.ok ? ok(null) : body;
  return ok({ body: body.value, contentType });
}
