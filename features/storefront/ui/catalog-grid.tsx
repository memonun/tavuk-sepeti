import { ProductCard } from "@/features/storefront/ui/product-card";

import type { Product } from "@/features/products/application/list-products";

/** Responsive catalog grid. Server component — renders client ProductCards. */
export function CatalogGrid({
  products,
  /**
   * True when the catalog query itself failed. Callers used to flatten that to
   * an empty array, so a database blip was sold to the customer as "we have
   * nothing for sale" — indistinguishable from a genuinely empty shop, and with
   * no reason to come back. An outage should say it is an outage.
   */
  unavailable = false,
}: {
  products: readonly Product[];
  unavailable?: boolean;
}) {
  if (unavailable) {
    return (
      <p
        className="rounded-2xl border border-dashed border-destructive/40 p-8 text-center text-muted-foreground"
        role="alert"
      >
        Ürünler şu anda yüklenemedi. Lütfen sayfayı yenileyin — sepetiniz
        duruyor.
      </p>
    );
  }

  if (products.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
        Şu anda satışta ürün bulunmuyor. Kısa süre içinde tekrar bakın.
      </p>
    );
  }

  // Column gaps stay wider than row gaps: the photographs need air between
  // them horizontally, while name/price/action already separate the rows.
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-8">
      {products.map((product) => (
        <ProductCard key={product.key} product={product} />
      ))}
    </div>
  );
}
