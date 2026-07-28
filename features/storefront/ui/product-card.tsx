"use client";

import { PlusIcon, TruckIcon } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { formatTRY } from "@/shared/utils/money";
import { env } from "@/shared/env";

import { productImagePublicUrl } from "@/features/products/application/product-image";
import { useCart } from "@/features/storefront/ui/cart-provider";
import {
  fromPriceMinor,
  hasVolumeDiscount,
  lineTotalMinor,
} from "@/features/storefront/ui/line-pricing";
import { productEmoji } from "@/features/storefront/ui/product-emoji";
import { QuantityStepper } from "@/features/storefront/ui/quantity-stepper";

import type { Product } from "@/features/products/application/list-products";

/** A single catalog card: soft rounded tile, price-per-unit, and either an
 *  "add" button or a quantity stepper once the item is in the basket. */
export function ProductCard({ product }: { product: Product }) {
  const { getQuantity, addItem } = useCart();
  const qty = getQuantity(product.key);
  const inCart = qty > 0;
  const imageUrl = productImagePublicUrl(
    product.image_path,
    env.NEXT_PUBLIC_SUPABASE_URL,
  );

  return (
    <div className="flex flex-col rounded-3xl border border-border/70 bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="relative mb-4 flex aspect-[5/4] items-center justify-center overflow-hidden rounded-2xl bg-secondary/60 text-6xl">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={product.image_alt ?? product.display_name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <span aria-hidden>{productEmoji(product.key)}</span>
        )}
        {product.is_featured ? (
          <span className="absolute left-2 top-2 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground shadow-sm">
            Öne çıkan
          </span>
        ) : null}
      </div>

      <h3 className="font-display text-lg leading-tight text-foreground">
        {product.display_name}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasVolumeDiscount(product) ? "başlangıç " : ""}
        {formatTRY(fromPriceMinor(product))}{" "}
        <span className="text-muted-foreground/80">/ {product.unit_label}</span>
      </p>
      {product.web_description ? (
        <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground/90">
          {product.web_description}
        </p>
      ) : null}

      {product.fulfillment_type === "shipping" ? (
        <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
          <TruckIcon className="size-3.5" /> Kargo ile gönderilir
        </span>
      ) : null}

      <div className="mt-5 flex items-center justify-between gap-3">
        {inCart ? (
          <>
            <QuantityStepper product={product} />
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {formatTRY(lineTotalMinor(product, qty))}
            </span>
          </>
        ) : (
          <Button
            type="button"
            size="lg"
            className="w-full rounded-full"
            onClick={() => addItem(product.key, product.min_qty)}
          >
            <PlusIcon /> Sepete ekle
          </Button>
        )}
      </div>
    </div>
  );
}
