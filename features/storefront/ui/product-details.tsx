import { MapPinIcon, TruckIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { Product } from "@/features/products/application/list-products";
import { productPageDescription } from "@/features/storefront/domain/product-structured-data";
import { PriceTag } from "@/features/storefront/ui/kit/price-tag";
import {
  fromPriceMinor,
  hasVolumeDiscount,
} from "@/features/storefront/ui/line-pricing";
import { ProductCard } from "@/features/storefront/ui/product-card";
import { productEmoji } from "@/features/storefront/ui/product-emoji";
import { ProductPurchaseControls } from "@/features/storefront/ui/product-purchase-controls";
import { formatTRY } from "@/shared/utils/money";

export function ProductDetails({
  product,
  imageUrl,
  related,
}: {
  product: Product;
  imageUrl: string | null;
  related: readonly Product[];
}) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <nav
        aria-label="İçerik yolu"
        className="mb-6 flex flex-wrap items-center gap-2 text-base text-muted-foreground"
      >
        <Link href="/" className="underline underline-offset-4">
          Ana sayfa
        </Link>
        <span aria-hidden>/</span>
        <span aria-current="page">{product.display_name}</span>
      </nav>
      <article className="grid gap-8 md:grid-cols-2 md:items-start lg:gap-12">
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-muted">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={product.image_alt ?? product.display_name}
              fill
              preload
              sizes="(max-width: 767px) 100vw, 50vw"
              className="object-cover object-center"
            />
          ) : (
            <span
              className="flex h-full items-center justify-center text-8xl"
              aria-hidden
            >
              {productEmoji(product.key)}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-4xl leading-tight break-words sm:text-5xl">
            {product.display_name}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            {productPageDescription(product)}
          </p>
          <PriceTag
            className="mt-6"
            amount={formatTRY(fromPriceMinor(product))}
            unit={product.unit_label}
            prefix={hasVolumeDiscount(product) ? "Başlangıç fiyatı" : undefined}
          />
          <p className="mt-4 flex items-center gap-2 text-lg font-semibold">
            {product.fulfillment_type === "shipping" ? (
              <TruckIcon className="size-6 text-primary" aria-hidden />
            ) : (
              <MapPinIcon className="size-6 text-primary" aria-hidden />
            )}
            {product.fulfillment_type === "shipping"
              ? "Türkiye geneli kargo"
              : "Malatya eve teslim"}
          </p>
          {product.price_tiers.length > 0 ? (
            <div className="mt-6 overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-left text-base">
                <caption className="px-4 py-3 text-left font-bold">
                  Miktara göre birim fiyatı
                </caption>
                <thead className="bg-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Miktar
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {product.unit_label} fiyatı
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {product.price_tiers.map((tier) => (
                    <tr key={tier.min_qty} className="border-t border-border">
                      <td className="px-4 py-3">
                        {tier.min_qty.toLocaleString("tr-TR")} ve üzeri
                      </td>
                      <td className="shop-money px-4 py-3 font-semibold">
                        {formatTRY(tier.unit_price_minor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <ProductPurchaseControls product={product} />
        </div>
      </article>
      {related.length > 0 ? (
        <section className="mt-14" aria-labelledby="related-products">
          <h2 id="related-products" className="mb-6 font-display text-3xl">
            Diğer çiftlik ürünlerimiz
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((item) => (
              <ProductCard key={item.key} product={item} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
