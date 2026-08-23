"use client";

import { MapPinIcon, PlusIcon, TruckIcon } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { formatTRY } from "@/shared/utils/money";
import { env } from "@/shared/env";

import { productImagePublicUrl } from "@/features/products/application/product-image";
import {
  DELIVERY_ONLY_BADGE,
  SHIPPING_BADGE,
} from "@/features/storefront/domain/storefront.config";
import { useCart } from "@/features/storefront/ui/cart-provider";
import {
  fromPriceMinor,
  halfUnitPriceMinor,
  hasHalfUnitOption,
  hasVolumeDiscount,
  lineTotalMinor,
} from "@/features/storefront/ui/line-pricing";
import { productEmoji } from "@/features/storefront/ui/product-emoji";
import { QuantityStepper } from "@/features/storefront/ui/quantity-stepper";

import type { Product } from "@/features/products/application/list-products";

/**
 * A single catalog item: photograph, then name, price and the buy control.
 *
 * Deliberately not a tile — no border, no shadow, no card background. These are
 * the same photographs the vitrine above shows on stage, so the collection is
 * the same shop window at shelf scale, and the products stay the only strong
 * colour on a cream page.
 */
export function ProductCard({ product }: { product: Product }) {
  const { getQuantity, addItem } = useCart();
  const qty = getQuantity(product.key);
  const inCart = qty > 0;
  const imageUrl = productImagePublicUrl(
    product.image_path,
    env.NEXT_PUBLIC_SUPABASE_URL,
  );

  return (
    // min-w-0: a grid item's default min-width is its content's min-content
    // width, not the grid track — without it the in-cart row below (which
    // has an un-shrinkable quantity stepper) forced this card wider than its
    // 2-column mobile track, overflowing into the next column.
    <article className="group flex h-full min-w-0 flex-col">
      {/* Radius tracks the frame's size — the stage above can carry the theme's
          2xl, a 350px shelf photo reads bubbly at it. */}
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-secondary/50">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={product.image_alt ?? product.display_name}
            fill
            sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 360px"
            className="object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <span
            className="flex h-full items-center justify-center text-6xl"
            aria-hidden
          >
            {productEmoji(product.key)}
          </span>
        )}
      </div>

      {/* min-h reserves 2 lines (text-xl leading-tight = 1.25rem × 1.25 = 25px/line)
          so the price row below starts at the same height whether a name wraps
          or not — without it, a long name in one card and a short one next to
          it in the same grid row pushed that card's price out of line with its
          neighbors. */}
      <h3 className="mt-4 line-clamp-2 min-h-[3.125rem] font-display text-xl leading-tight tracking-[-0.01em] text-foreground">
        {product.display_name}
      </h3>
      {/* min-h reserves 2 lines here too — a long unit_label ("paket (15
          adet)") plus the "başlangıç" prefix can wrap on the narrower
          showcase columns while a short one ("kg") never does, which shifted
          this card's badge out of line with its row-neighbors same as the
          name did above. */}
      <p className="mt-1.5 min-h-12 text-base text-muted-foreground">
        {hasVolumeDiscount(product) ? "başlangıç " : ""}
        <span className="font-medium text-foreground tabular-nums">
          {formatTRY(fromPriceMinor(product))}
        </span>{" "}
        / {product.unit_label}
      </p>
      {/* min-h reserves this line's own height (16px) even when absent, so
          the fulfilment badge below it lands at the same row across cards
          regardless of which ones have a half-kilo price and which don't. */}
      <div className="mt-0.5 min-h-4">
        {hasHalfUnitOption(product) ? (
          <p className="text-xs text-muted-foreground">
            yarım kilo{" "}
            <span className="text-foreground tabular-nums">
              {formatTRY(halfUnitPriceMinor(product))}
            </span>
          </p>
        ) : null}
      </div>

      {/* Fulfilment rule, right under the price where an older shopper is
          already reading — a small pill, not a wall of badges, but not a
          quiet gray footnote either. The delivery restriction reads warmer
          (primary-tinted) since it's the one that can surprise someone. */}
      {product.fulfillment_type === "shipping" ? (
        <p className="mt-2.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
          <TruckIcon className="size-3.5 shrink-0" aria-hidden /> {SHIPPING_BADGE}
        </p>
      ) : (
        <p className="mt-2.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          <MapPinIcon className="size-3.5 shrink-0" aria-hidden />{" "}
          {DELIVERY_ONLY_BADGE}
        </p>
      )}

      {product.web_description ? (
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground/90">
          {product.web_description}
        </p>
      ) : null}
      {product.is_featured ? (
        <p className="mt-1.5 text-xs tracking-[0.14em] text-primary uppercase">
          Öne çıkan
        </p>
      ) : null}

      {/* flex-wrap: the stepper's buttons are large (48px, accessibility) and
          in the homepage's 2-column mobile grid the two together no longer
          fit one row — without wrap the price overflowed past the card into
          the next column instead of dropping to its own line. */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-5">
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
            className="h-12 w-full rounded-full text-base sm:w-auto sm:px-6"
            onClick={() => addItem(product.key, product.min_qty)}
          >
            <PlusIcon className="size-5" /> Sepete ekle
          </Button>
        )}
      </div>
    </article>
  );
}
