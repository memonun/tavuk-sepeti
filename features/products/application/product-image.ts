/**
 * Client-safe public API for product images — the cross-feature entry point
 * (e.g. the storefront) uses this instead of importing the domain module
 * directly, and unlike list-products.ts it carries no `server-only` guard so a
 * Client Component can call it.
 */
export {
  PRODUCT_IMAGE_BUCKET,
  productImagePublicUrl,
} from "@/features/products/domain/product-image";
