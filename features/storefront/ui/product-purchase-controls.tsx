"use client";

import { CheckIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import type { Product } from "@/features/products/application/list-products";
import { useCart } from "@/features/storefront/ui/cart-provider";
import { hapticTick } from "@/features/storefront/ui/kit/haptic";
import { ShopButton } from "@/features/storefront/ui/kit/shop-button";
import { trackProductAddedToCart } from "@/features/storefront/ui/meta-events";
import { LineTotal } from "@/features/storefront/ui/line-total";
import { QuantityStepper } from "@/features/storefront/ui/quantity-stepper";

/** The card and detail page share the exact same basket interaction. */
export function ProductPurchaseControls({ product }: { product: Product }) {
  const { getQuantity, addItem } = useCart();
  const qty = getQuantity(product.key);
  const inCart = qty > 0;
  // True once this card has gone from "in the basket" back to "not": only
  // then does the "Sepete ekle" button play its entrance (the way back along
  // the same path the quantity control arrived by). Without the flag every
  // button on the page would fade in on first load, which is exactly the
  // decorative page-load motion this shop does not want. Adjusted during
  // render — React's documented pattern for deriving state from a change.
  const [returnedFromCart, setReturnedFromCart] = useState(false);
  const [wasInCart, setWasInCart] = useState(inCart);
  if (wasInCart !== inCart) {
    setWasInCart(inCart);
    if (!inCart) setReturnedFromCart(true);
  }

  return (
    <div className="mt-auto pt-5">
      {inCart ? (
        // `key` remounts on the swap so `.shop-enter` plays: the button
        // visibly BECOMES this, rather than one thing vanishing and
        // another appearing.
        <div key="in-cart" className="shop-enter flex flex-col gap-3">
          <p className="flex items-center gap-2 text-lg font-bold text-primary">
            <CheckIcon
              className="size-6 shrink-0"
              strokeWidth={3}
              aria-hidden
            />
            Sepette
            <span className="ml-auto text-right">
              <LineTotal product={product} quantity={qty} className="shop-money text-foreground" />
            </span>
          </p>
          <QuantityStepper product={product} block />
        </div>
      ) : (
        // The entrance sits on a wrapper, not on the button: `.shop-enter`
        // sets its own `transition`, which would replace the button's
        // 140ms press transition.
        <div key="add" className={returnedFromCart ? "shop-enter" : undefined}>
          <ShopButton
            size="lg"
            block
            onClick={() => {
              addItem(product.key, product.min_qty);
              hapticTick();
              // Reported only after the basket really changed; no-op without a Pixel ID.
              trackProductAddedToCart(product, product.min_qty);
            }}
          >
            <PlusIcon aria-hidden /> Sepete ekle
          </ShopButton>
        </div>
      )}
    </div>
  );
}
