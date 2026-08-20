"use client";

import Image from "next/image";
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
import { DELIVERY_PROVINCE } from "@/features/storefront/domain/storefront.config";
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
import { env } from "@/shared/env";
import { formatTRY } from "@/shared/utils/money";

import { productImagePublicUrl } from "@/features/products/application/product-image";
import { useCart } from "@/features/storefront/ui/cart-provider";
import { lineTotalMinor } from "@/features/storefront/ui/line-pricing";
import { productEmoji } from "@/features/storefront/ui/product-emoji";
import { QuantityStepper } from "@/features/storefront/ui/quantity-stepper";

import type { Product } from "@/features/products/application/list-products";

/** Header basket button + slide-over. Resolves each line against the live
 *  catalog so displayed prices are never stale.
 *
 * `variant` swaps only the opening control — the header's pill button
 * ("header") or the mobile tab bar's stacked icon+label ("tab") — while the
 * slide-over itself (lines, minimum check, checkout link) stays the single
 * shared instance of this logic. Each mount owns its own open/close state,
 * but both read the same module-level cart store, so a basket opened from
 * the tab bar shows the same lines as one opened from the header. */
export function CartSheet({
  products,
  cargoMinOrderMinor,
  variant = "header",
}: {
  products: readonly Product[];
  /** Cargo order floor in kuruş — stated here so a customer never carries a
   *  too-small basket all the way to checkout only to be refused. */
  cargoMinOrderMinor: number;
  variant?: "header" | "tab";
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
  // basket a route order. This header preview has no address context (the
  // customer hasn't reached checkout yet), so it can only ever see the
  // cart-only channel — an address-upgraded flexible-only basket still shows
  // the cargo floor here and gets the (lower) eve-servis one once an address
  // makes that call at actual checkout.
  const channelItems = rows.map((r) => ({
    product_key: r.product.key,
    fulfillment_type: r.product.fulfillment_type,
  }));
  const mode = requiredAddressMode(channelItems);
  const cartChannel = resolveOrderChannel(channelItems);
  const minimum =
    cartChannel === "shipping"
      ? checkOrderMinimum(subtotal, cargoMinOrderMinor)
      : { ok: true, shortfallMinor: 0 };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {variant === "tab" ? (
        <SheetTrigger
          render={
            <button
              type="button"
              className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-muted-foreground transition-colors active:bg-secondary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          }
        >
          <span className="relative">
            <ShoppingBasketIcon className="size-6" aria-hidden />
            {hydrated && lineCount > 0 ? (
              <span className="absolute -top-1.5 -right-2 flex min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[0.65rem] font-bold text-primary-foreground tabular-nums">
                {lineCount}
              </span>
            ) : null}
          </span>
          <span className="text-[11px] leading-none font-semibold">Sepetim</span>
        </SheetTrigger>
      ) : (
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
      )}

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
              {rows.map(({ product, quantity }) => {
                const imageUrl = productImagePublicUrl(
                  product.image_path,
                  env.NEXT_PUBLIC_SUPABASE_URL,
                );
                return (
                <li
                  key={product.key}
                  className="flex items-center gap-3 rounded-2xl border border-border/60 p-3"
                >
                  <div className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary/60">
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt={product.image_alt ?? product.display_name}
                        fill
                        sizes="44px"
                        className="object-cover object-center"
                      />
                    ) : (
                      <span className="text-2xl" aria-hidden>
                        {productEmoji(product.key)}
                      </span>
                    )}
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
                );
              })}
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
                <strong className="block font-bold text-foreground">
                  Teslimat Bilgisi
                </strong>
                <span className="mt-1 block">
                  <strong className="font-medium text-foreground">Yumurta:</strong>{" "}
                  Kargoda hasar görme riski nedeniyle yalnızca {DELIVERY_PROVINCE}{" "}
                  il sınırları içerisinde teslim edilir.
                </span>
                <span className="mt-1 block">
                  <strong className="font-medium text-foreground">
                    Süt ürünleri:
                  </strong>{" "}
                  Uygun taşıma koşullarının korunabilmesi için yalnızca{" "}
                  {DELIVERY_PROVINCE} il sınırları içerisinde teslim edilir.
                </span>
                <span className="mt-1 block">
                  <strong className="font-medium text-foreground">
                    Diğer ürünler:
                  </strong>{" "}
                  Kargoya uygun ürünlerimiz Türkiye&apos;nin her yerine
                  gönderilir.
                </span>
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
                  {orderMinimumMessage("shipping", cargoMinOrderMinor, minimum.shortfallMinor)}
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
