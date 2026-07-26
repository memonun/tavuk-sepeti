"use client";

import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatTRY } from "@/shared/utils/money";

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

  return (
    <div className="flex flex-col rounded-3xl border border-border/70 bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-4 flex aspect-[5/4] items-center justify-center rounded-2xl bg-secondary/60 text-6xl">
        <span aria-hidden>{productEmoji(product.key)}</span>
      </div>

      <h3 className="font-display text-lg leading-tight text-foreground">
        {product.display_name}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasVolumeDiscount(product) ? "başlangıç " : ""}
        {formatTRY(fromPriceMinor(product))}{" "}
        <span className="text-muted-foreground/80">/ {product.unit_label}</span>
      </p>

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
