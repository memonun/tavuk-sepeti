/**
 * Product cover-image helpers — pure, client-safe (no server-only guard, no
 * env access). Images live in the public `product-images` Storage bucket; a
 * product row stores only the object key (image_path) and the public URL is
 * derived here from NEXT_PUBLIC_SUPABASE_URL passed in by the caller.
 */
import { CANONICAL_ORIGIN } from "@/shared/canonical-origin";
import {
  UPLOAD_IMAGE_ALLOWED_TYPES,
  UPLOAD_IMAGE_MAX_BYTES,
  imageExtForType,
  isAllowedUploadImageType,
  type UploadImageMime,
} from "@/shared/utils/image-upload";

/** Storage bucket that holds product cover images. */
export const PRODUCT_IMAGE_BUCKET = "product-images";

// Upload rules are shared with the showcase photos; the product names below
// are kept so the product code reads in its own terms.
export { imageExtForType };
export const PRODUCT_IMAGE_ALLOWED_TYPES = UPLOAD_IMAGE_ALLOWED_TYPES;
export type ProductImageMime = UploadImageMime;
/** 5 MB — mirrors the bucket file_size_limit. */
export const PRODUCT_IMAGE_MAX_BYTES = UPLOAD_IMAGE_MAX_BYTES;
export const isAllowedProductImageType = isAllowedUploadImageType;

/**
 * Storage object key for a product's cover image. Includes a random id so a
 * replacement lands on a fresh URL (defeats CDN caching of the old image).
 */
export function buildProductImageKey(
  productKey: string,
  ext: string,
  id: string,
): string {
  return `${productKey}/${id}.${ext}`;
}

/**
 * Public URL for a stored product image. `imagePath` is the object key
 * ("eggs/ab12.webp"); `supabaseUrl` is NEXT_PUBLIC_SUPABASE_URL. Returns null
 * when there's no image so callers can fall back to a placeholder.
 */
export function productImagePublicUrl(
  imagePath: string | null,
  supabaseUrl: string,
): string | null {
  if (!imagePath) return null;
  const base = supabaseUrl.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/${imagePath}`;
}

/**
 * Path on our own domain that serves a product image
 * (app/urun-gorsel/[...path]/route.ts proxies it from Storage).
 */
export const PRODUCT_IMAGE_SITE_PREFIX = "/urun-gorsel";

/**
 * The object keys buildProductImageKey writes: "<product key>/<id>.<ext>".
 * The image route serves nothing else, so it can never be used to read an
 * arbitrary Storage object or another bucket.
 */
const PRODUCT_IMAGE_PATH_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*\/[A-Za-z0-9_-]{1,64}\.(?:jpg|png|webp)$/;

export function isProductImagePath(imagePath: string): boolean {
  return PRODUCT_IMAGE_PATH_PATTERN.test(imagePath);
}

/** Mime type for a stored image's object key, from its extension. */
export function productImageMimeForPath(imagePath: string): ProductImageMime | null {
  if (imagePath.endsWith(".jpg")) return "image/jpeg";
  if (imagePath.endsWith(".png")) return "image/png";
  if (imagePath.endsWith(".webp")) return "image/webp";
  return null;
}

/**
 * Absolute product image URL on our own domain, for everything that hands an
 * image to the outside world: Product JSON-LD, link previews (og:image) and
 * the Merchant Center feed. Search engines then credit the image to
 * apuhanciftligi.com instead of the Supabase host. On-page <Image>s keep using
 * productImagePublicUrl — next/image already serves them from /_next/image.
 *
 * A key that does not have the shape the route serves (none exist today)
 * falls back to the Storage URL rather than linking to a 404.
 */
export function productImageSiteUrl(
  imagePath: string | null,
  supabaseUrl: string,
): string | null {
  if (!imagePath) return null;
  if (!isProductImagePath(imagePath)) return productImagePublicUrl(imagePath, supabaseUrl);
  return `${CANONICAL_ORIGIN}${PRODUCT_IMAGE_SITE_PREFIX}/${imagePath}`;
}
