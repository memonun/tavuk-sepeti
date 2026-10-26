/**
 * Client-safe pricing surface for the products feature.
 *
 * `list-products.ts` is `server-only` (it reads the DB), so client components
 * (e.g. ProductPicker) can't import values from it. This module re-exports the
 * pure pricing helpers from the domain without the server-only guard, so both
 * the order form (client) and the server enrichment path use one implementation.
 */
export {
  discountPercent,
  priceOrderLine,
  productLinePricing,
} from "@/features/products/domain/product-pricing";
export type {
  ProductPriceTier,
  LinePrice,
  LinePricingInput,
  ProductPricingFields,
} from "@/features/products/domain/product-pricing";
