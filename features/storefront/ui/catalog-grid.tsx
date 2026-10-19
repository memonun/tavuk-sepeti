import { ShopNotice } from "@/features/storefront/ui/kit/shop-notice";
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
      <ShopNotice tone="danger" role="alert" title="Ürünler şu anda yüklenemedi">
        Lütfen sayfayı yenileyin. Sepetiniz duruyor.
      </ShopNotice>
    );
  }

  if (products.length === 0) {
    return (
      <ShopNotice title="Şu anda satışta ürün bulunmuyor">
        Kısa süre içinde tekrar bakın.
      </ShopNotice>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
      {/* Only the first card's picture loads right away, at high priority: it
          is the largest thing a phone sees first (Lighthouse's LCP element).
          The rest stay lazy, cards 2–3 included. On a phone they sit below
          the first screen, and fetched up front (~130 KB) they slowed the first
          paint by ~0.2 s and the first picture by ~0.5 s on a throttled
          mobile run (2026-10-18). On desktop, where they share the first row,
          a lazy picture already on screen is still fetched as soon as the
          page is laid out. */}
      {products.map((product, index) => (
        <ProductCard
          key={product.key}
          product={product}
          imagePriority={index === 0}
        />
      ))}
    </div>
  );
}
