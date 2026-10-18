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
      {/* The first row (one card on a phone, three on desktop) is on the first
          screen: load those pictures right away, the very first one first. */}
      {products.map((product, index) => (
        <ProductCard
          key={product.key}
          product={product}
          imagePriority={index === 0 ? "high" : index < 3 ? "eager" : undefined}
        />
      ))}
    </div>
  );
}
