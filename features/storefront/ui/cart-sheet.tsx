"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MapPinIcon, ShoppingBasketIcon, TruckIcon } from "lucide-react";

import { cartSubtotalMinor } from "@/features/storefront/domain/cart";
import {
  requiredAddressMode,
  resolveOrderChannel,
} from "@/features/storefront/domain/fulfillment-channel";
import {
  checkOrderMinimum,
  orderMinimumMessage,
} from "@/features/storefront/domain/order-minimum";
import {
  CARGO_FREE_SHIPPING_NOTICE,
  DELIVERY_PROVINCE,
} from "@/features/storefront/domain/storefront.config";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatTRY } from "@/shared/utils/money";

import { useCart } from "@/features/storefront/ui/cart-provider";
import { lineTotalMinor } from "@/features/storefront/ui/line-pricing";
import { productEmoji } from "@/features/storefront/ui/product-emoji";
import { QuantityStepper } from "@/features/storefront/ui/quantity-stepper";

import type { Product } from "@/features/products/application/list-products";

/** Header basket button + slide-over. Resolves each line against the live
 *  catalog so displayed prices are never stale. */
export function CartSheet({
  products,
  cargoMinOrderMinor,
}: {
  products: readonly Product[];
  /** Cargo order floor in kuruş — stated here so a customer never carries a
   *  too-small basket all the way to checkout only to be refused. */
  cargoMinOrderMinor: number;
}) {
  const { lines, lineCount, hydrated, clear, retainOnly } = useCart();
  const [open, setOpen] = useState(false);

  const rows = lines.flatMap((line) => {
    const product = products.find((p) => p.key === line.product_key);
    return product ? [{ product, quantity: line.quantity }] : [];
  });

  // This component is mounted by the shop layout on every page, so it is the one
  // place guaranteed to see both the persisted cart and the live catalog. Drop
  // lines the catalog no longer sells, otherwise they stay invisible-but-counted
  // forever: the badge disagrees with the sheet, and checkout dies on a product
  // key the customer cannot see.
  //
  // Guarded on a NON-EMPTY catalog on purpose. `getStorefrontCatalog` failures
  // are currently flattened to `[]` by the layout, and pruning against that
  // would silently empty a real basket on a transient database blip.
  useEffect(() => {
    if (products.length === 0) return;
    retainOnly(new Set(products.map((p) => p.key)));
  }, [products, retainOnly]);

  const subtotal = cartSubtotalMinor(
    rows.map((r) => lineTotalMinor(r.product, r.quantity)),
  );

  // Same rule the checkout and the server use: any fresh line makes the whole
  // basket a route order.
  const channelItems = rows.map((r) => ({
    product_key: r.product.key,
    fulfillment_type: r.product.fulfillment_type,
  }));
  const mode = requiredAddressMode(channelItems);
  const minimum = checkOrderMinimum(
    resolveOrderChannel(channelItems),
    subtotal,
    cargoMinOrderMinor,
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="outline" size="lg" className="relative rounded-full" />
        }
      >
        <ShoppingBasketIcon />
        <span className="hidden sm:inline">Sepet</span>
        {hydrated && lineCount > 0 ? (
          <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
            {lineCount}
          </span>
        ) : null}
      </SheetTrigger>

      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle className="font-display text-lg">Sepetiniz</SheetTitle>
        </SheetHeader>

        {rows.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <ShoppingBasketIcon className="size-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">Sepetiniz henüz boş.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <ul className="flex flex-col gap-3">
              {rows.map(({ product, quantity }) => (
                <li
                  key={product.key}
                  className="flex items-center gap-3 rounded-2xl border border-border/60 p-3"
                >
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary/60 text-2xl">
                    <span aria-hidden>{productEmoji(product.key)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {product.display_name}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatTRY(lineTotalMinor(product, quantity))}
                    </p>
                    <div className="mt-1.5">
                      <QuantityStepper product={product} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* The only way out of a basket the customer wants to abandon.
                Without it, emptying a cart meant tapping "−" once per unit on
                every row — 18 taps for a 10 kg line — and there was no exit at
                all from a line the catalog had stopped selling. */}
            <div className="mt-3 text-right">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => clear()}
              >
                Sepeti boşalt
              </Button>
            </div>
          </div>
        )}

        {rows.length > 0 ? (
          <SheetFooter className="border-t border-border/60">
            {/* Say how this basket will arrive BEFORE checkout, so the delivery
                restriction is never a surprise at the address step. */}
            <p className="flex items-start gap-2 rounded-lg bg-secondary/60 px-2.5 py-2 text-xs text-muted-foreground">
              {mode === "route" ? (
                <MapPinIcon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
              ) : (
                <TruckIcon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
              )}
              <span>
                {mode === "route"
                  ? `Sepetinizde taze ürün var — bu sipariş yalnızca ${DELIVERY_PROVINCE} içine, kendi ekibimizle elden teslim edilir.`
                  : `Bu sepetin tamamı kargoyla gönderilir — Türkiye'nin her yerine. ${CARGO_FREE_SHIPPING_NOTICE}`}
              </span>
            </p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Ara toplam</span>
              <span className="font-semibold tabular-nums">
                {formatTRY(subtotal)}
              </span>
            </div>
            {minimum.ok ? (
              <Link
                href="/odeme"
                onClick={() => setOpen(false)}
                className={cn(buttonVariants({ size: "lg" }), "w-full rounded-full")}
              >
                Siparişi tamamla
              </Link>
            ) : (
              // Below the cargo floor: say so here rather than letting the
              // customer discover it after filling in the whole checkout.
              <div className="flex flex-col gap-2">
                <p
                  className="rounded-lg bg-destructive/5 px-2.5 py-2 text-xs text-destructive"
                  role="status"
                >
                  {orderMinimumMessage(cargoMinOrderMinor, minimum.shortfallMinor)}
                </p>
                <Button
                  type="button"
                  size="lg"
                  className="w-full rounded-full"
                  disabled
                >
                  Siparişi tamamla
                </Button>
              </div>
            )}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
