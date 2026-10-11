"use client";

import { CheckIcon, MapPinIcon, PlusIcon, TruckIcon } from "lucide-react";
import Image from "next/image";

import { formatTRY } from "@/shared/utils/money";
import { env } from "@/shared/env";

import { productImagePublicUrl } from "@/features/products/application/product-image";
import {
  DELIVERY_ONLY_BADGE,
  SHIPPING_BADGE,
} from "@/features/storefront/domain/storefront.config";
import { useCart } from "@/features/storefront/ui/cart-provider";
import { PriceTag } from "@/features/storefront/ui/kit/price-tag";
import { ShopButton } from "@/features/storefront/ui/kit/shop-button";
import { trackProductAddedToCart } from "@/features/storefront/ui/meta-events";
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
 * A single catalog item, read top to bottom in the order an older shopper
 * asks the questions: what is it (photo, name), what does it cost (the price
 * tag — the one loud thing on the card), can I get it where I live (the
 * fulfilment line), and the one button.
 *
 * A bordered card on purpose: with several products on a page, the edge is
 * what says where one product's price and button end and the next one's
 * begin. Nothing on the card is under 16px.
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
    // width, not the grid track — without it a long unbreakable name or the
    // quantity control could push this card wider than its column.
    <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-(--shop-shadow-sm)">
      <div className="relative aspect-[4/3] bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={product.image_alt ?? product.display_name}
            fill
            sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 360px"
            className="object-cover object-center"
          />
        ) : (
          <span
            className="flex h-full items-center justify-center text-7xl"
            aria-hidden
          >
            {productEmoji(product.key)}
          </span>
        )}
        {product.is_featured ? (
          <p className="absolute top-3 left-3 rounded-full bg-card px-3 py-1 text-base font-bold text-foreground shadow-(--shop-shadow-sm)">
            Öne çıkan
          </p>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        {/* From `sm` up the cards sit side by side, so the name reserves two
            lines (1.5rem × 1.2) and the price tags line up across a row
            whether a name wraps or not. On a phone there is one card per row
            and nothing to line up with. */}
        <h3 className="font-display text-2xl leading-[1.2] break-words text-foreground sm:line-clamp-2 sm:min-h-[3.6rem]">
          {product.display_name}
        </h3>

        <PriceTag
          className="mt-3 self-start"
          amount={formatTRY(fromPriceMinor(product))}
          unit={product.unit_label}
          prefix={hasVolumeDiscount(product) ? "başlangıç" : undefined}
        />
        {hasHalfUnitOption(product) ? (
          <p className="mt-2 text-base text-muted-foreground">
            Yarım kilo{" "}
            <span className="shop-money font-bold text-foreground">
              {formatTRY(halfUnitPriceMinor(product))}
            </span>
          </p>
        ) : null}

        {/* Fulfilment rule, right under the price where the shopper is already
            reading. The Malatya-only one is the one that can surprise someone,
            so it gets the warmer panel. Icon AND words — never colour alone. */}
        {product.fulfillment_type === "shipping" ? (
          <p className="mt-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <TruckIcon className="size-5 shrink-0 text-primary" aria-hidden />
            {SHIPPING_BADGE}
          </p>
        ) : (
          <p className="mt-3 flex items-center gap-2 self-start rounded-xl bg-(--shop-apricot-soft) px-3 py-1.5 text-base font-semibold text-foreground">
            <MapPinIcon className="size-5 shrink-0" aria-hidden />
            {DELIVERY_ONLY_BADGE}
          </p>
        )}

        {product.web_description ? (
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {product.web_description}
          </p>
        ) : null}

        <div className="mt-auto pt-5">
          {inCart ? (
            // `key` remounts on the swap so `.shop-enter` plays: the button
            // visibly BECOMES this, rather than one thing vanishing and
            // another appearing.
            <div key="in-cart" className="shop-enter flex flex-col gap-3">
              <p className="flex items-center gap-2 text-lg font-bold text-primary">
                <CheckIcon className="size-6 shrink-0" strokeWidth={3} aria-hidden />
                Sepette
                <span className="shop-money ml-auto text-foreground">
                  {formatTRY(lineTotalMinor(product, qty))}
                </span>
              </p>
              <QuantityStepper product={product} block />
            </div>
          ) : (
            <ShopButton
              key="add"
              size="lg"
              block
              onClick={() => {
                addItem(product.key, product.min_qty);
                // Reported only after the basket really changed; no-op without a Pixel ID.
                trackProductAddedToCart(product, product.min_qty);
              }}
            >
              <PlusIcon aria-hidden /> Sepete ekle
            </ShopButton>
          )}
        </div>
      </div>
    </article>
  );
}
