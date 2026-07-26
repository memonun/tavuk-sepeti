import { ProductCard } from "@/features/storefront/ui/product-card";

import type { Product } from "@/features/products/application/list-products";

/** Responsive catalog grid. Server component — renders client ProductCards. */
export function CatalogGrid({ products }: { products: readonly Product[] }) {
  if (products.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
        Şu anda satışta ürün bulunmuyor. Kısa süre içinde tekrar bakın.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <ProductCard key={product.key} product={product} />
      ))}
    </div>
  );
}
