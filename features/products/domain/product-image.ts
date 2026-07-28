/**
 * Product cover-image helpers — pure, client-safe (no server-only guard, no
 * env access). Images live in the public `product-images` Storage bucket; a
 * product row stores only the object key (image_path) and the public URL is
 * derived here from NEXT_PUBLIC_SUPABASE_URL passed in by the caller.
 */

/** Storage bucket that holds product cover images. */
export const PRODUCT_IMAGE_BUCKET = "product-images";

/** Accepted upload types — mirrors the bucket's allowed_mime_types. */
export const PRODUCT_IMAGE_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ProductImageMime = (typeof PRODUCT_IMAGE_ALLOWED_TYPES)[number];

/** Hard cap for an uploaded image (5 MB) — mirrors the bucket file_size_limit. */
export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Type guard for an accepted image mime type. */
export function isAllowedProductImageType(
  mime: string,
): mime is ProductImageMime {
  return (PRODUCT_IMAGE_ALLOWED_TYPES as readonly string[]).includes(mime);
}

/** File extension for a stored/uploaded image mime type, or null if unknown. */
export function imageExtForType(mime: string): "jpg" | "png" | "webp" | null {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

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
