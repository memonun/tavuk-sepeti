import { ProductCard } from "@/features/storefront/ui/product-card";

import type { Product } from "@/features/products/application/list-products";

/**
 * How many products the highlight strip shows. Kept small and even so the
 * 2-column mobile grid never ends on an orphaned single card.
 */
const SHOWCASE_LIMIT = 4;

/**
 * Homepage highlight strip — a small, curated slice of the catalog shown as a
 * plain grid, not a swipeable carousel. Server component — renders client
 * `ProductCard`s, same as `CatalogGrid` below it.
 *
 * This replaces an earlier scroll-snap "vitrine" that required a swipe
 * gesture to see anything past the first product. For the target audience
 * here (customers who should never have to *discover* an interaction), a
 * grid that shows everything at once without needing a gesture is the right
 * trade — the full catalog is one scroll away regardless.
 *
 * `products` is expected to already be scoped to the customer's chosen
 * delivery region (see the homepage) — a product that can't be bought under
 * the current scope should never surface here as a tempting dead end.
 */
export function ProductShowcase({ products }: { products: readonly Product[] }) {
  const featured = products.filter((p) => p.is_featured);
  const items = (featured.length > 0 ? featured : products).slice(0, SHOWCASE_LIMIT);

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="showcase-heading">
      <h2
        id="showcase-heading"
        className="font-display text-2xl leading-tight tracking-[-0.01em] text-foreground sm:text-3xl"
      >
        Öne Çıkan Ürünler
      </h2>
      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4 sm:gap-x-6">
        {items.map((product) => (
          <ProductCard key={product.key} product={product} />
        ))}
      </div>
    </section>
  );
}
