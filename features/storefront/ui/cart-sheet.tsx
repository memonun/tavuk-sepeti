"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  ChevronRightIcon,
  MapPinIcon,
  ShoppingBasketIcon,
  TruckIcon,
} from "lucide-react";
import { toast } from "sonner";

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
  deliveryFeeNotice,
  DELIVERY_PROVINCE,
} from "@/features/storefront/domain/storefront.config";
import {
  Sheet,
  SheetClose,
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
import { ShopButton, ShopLinkButton } from "@/features/storefront/ui/kit/shop-button";
import { ShopNotice } from "@/features/storefront/ui/kit/shop-notice";
import { shopSheetClass } from "@/features/storefront/ui/kit/shop-sheet";
import { tabItemClass, tabLabelClass } from "@/features/storefront/ui/kit/tab-item";
import { QuantityStepper } from "@/features/storefront/ui/quantity-stepper";

import type { Product } from "@/features/products/application/list-products";

/** Header basket button + slide-over. Resolves each line against the live
 *  catalog so displayed prices are never stale.
 *
 * `variant` swaps only the opening control — the header's pill button
 * ("header"), the mobile tab bar's stacked icon+label ("tab"), or the phone's
 * basket bar ("bar": a full-width strip above the tab bar that exists only
 * while the basket has something in it, and says how much) — while the
 * slide-over itself (lines, minimum check, checkout link) stays the single
 * shared instance of this logic. Each mount owns its own open/close state,
 * but both read the same module-level cart store, so a basket opened from
 * the tab bar shows the same lines as one opened from the header. */
export function CartSheet({
  products,
  cargoMinOrderMinor,
  deliveryFeeMinor,
  variant = "header",
}: {
  products: readonly Product[];
  /** Cargo order floor in kuruş — stated here so a customer never carries a
   *  too-small basket all the way to checkout only to be refused. */
  cargoMinOrderMinor: number;
  /** Live eve-servis fee in kuruş (0 = free), for the "ücret eklenir" note. */
  deliveryFeeMinor: number;
  variant?: "header" | "tab" | "bar";
}) {
  const { lines, lineCount, hydrated, clear, retainOnly, addItem } = useCart();
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
      {variant === "bar" ? (
        // Rendered only once the persisted basket has been read AND has
        // something in it. `data-cart-bar` is what theme.css keys the taller
        // dock height off, so the WhatsApp button moves up out of its way.
        hydrated && rows.length > 0 ? (
          <SheetTrigger
            render={
              <button
                type="button"
                data-cart-bar
                className="shop-press shop-enter-up flex min-h-15 w-full items-center gap-3 bg-primary px-4 py-2 text-left text-primary-foreground focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-card"
              />
            }
          >
            <ShoppingBasketIcon className="size-7 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-base">Sepetinizde {rows.length} ürün</span>
              <span className="shop-money block text-xl font-extrabold">
                {formatTRY(subtotal)}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-card py-2 pr-2 pl-4 text-base font-bold text-primary">
              Sepeti gör
              <ChevronRightIcon className="size-5" aria-hidden />
            </span>
          </SheetTrigger>
        ) : null
      ) : variant === "tab" ? (
        <SheetTrigger
          render={<button type="button" className={cn(tabItemClass, "text-foreground")} />}
        >
          <span className="relative">
            <ShoppingBasketIcon className="size-7" aria-hidden />
            {hydrated && lineCount > 0 ? (
              <span className="absolute -top-2 -right-3.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-(--shop-apricot) px-1.5 text-sm font-bold text-foreground tabular-nums">
                {lineCount}
              </span>
            ) : null}
          </span>
          <span className={tabLabelClass}>Sepetim</span>
        </SheetTrigger>
      ) : (
        <SheetTrigger render={<ShopButton variant="quiet" />}>
          <ShoppingBasketIcon aria-hidden />
          Sepet
          {hydrated && lineCount > 0 ? (
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-(--shop-apricot) px-1.5 text-sm font-bold text-foreground tabular-nums">
              {lineCount}
            </span>
          ) : null}
        </SheetTrigger>
      )}

      {/* A panel arrives from the control that summoned it. On a phone the
          basket is opened from the dock at the bottom of the screen (the
          basket bar or the "Sepetim" tab), so it rises from there and leaves
          a strip of the page showing above it; the desktop header button
          sits top-right, so there it slides in from the right. Closed with
          "Kapat" or a tap on the dimmed page — never a drag, which this
          audience should not have to perform. */}
      <SheetContent
        side={variant === "header" ? "right" : "bottom"}
        showCloseButton={false}
        className={shopSheetClass(
          "data-[side=right]:w-full data-[side=right]:sm:max-w-md data-[side=bottom]:max-h-[92dvh] data-[side=bottom]:rounded-t-3xl",
        )}
      >
        <SheetHeader className="flex-row items-center justify-between border-b border-border px-4 py-3">
          <SheetTitle className="font-display text-2xl">Sepetiniz</SheetTitle>
          <SheetClose render={<ShopButton variant="quiet" />}>Kapat</SheetClose>
        </SheetHeader>

        {rows.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] text-center">
            <ShoppingBasketIcon className="size-14 text-muted-foreground" aria-hidden />
            <p className="text-xl font-bold text-foreground">Sepetiniz boş</p>
            <p className="text-lg text-muted-foreground">
              Beğendiğiniz ürünün altındaki “Sepete ekle” düğmesine basın.
            </p>
            <SheetClose render={<ShopButton size="lg" />}>Ürünlere dön</SheetClose>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            <ul className="flex flex-col gap-3">
              {rows.map(({ product, quantity }) => {
                const imageUrl = productImagePublicUrl(
                  product.image_path,
                  env.NEXT_PUBLIC_SUPABASE_URL,
                );
                return (
                  <li
                    key={product.key}
                    className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                        {imageUrl ? (
                          <Image
                            src={imageUrl}
                            alt={product.image_alt ?? product.display_name}
                            fill
                            sizes="64px"
                            className="object-cover object-center"
                          />
                        ) : (
                          <span className="text-3xl" aria-hidden>
                            {productEmoji(product.key)}
                          </span>
                        )}
                      </div>
                      {/* Name wraps instead of truncating: "Gün Kurusu Kayısı
                          Çeki…" tells nobody which of two apricot products
                          this line is. The price sits UNDER the name, not
                          beside it: side by side, a long price squeezed the
                          name down to one letter per line on a narrow phone. */}
                      <div className="min-w-0 flex-1">
                        <p className="text-lg leading-snug font-bold break-words">
                          {product.display_name}
                        </p>
                        <p className="shop-money text-lg font-bold text-primary">
                          {formatTRY(lineTotalMinor(product, quantity))}
                        </p>
                      </div>
                    </div>
                    <QuantityStepper product={product} block />
                  </li>
                );
              })}
            </ul>

            {/* The only way out of a basket the customer wants to abandon.
                Without it, emptying a cart meant tapping "−" once per unit on
                every row — 18 taps for a 10 kg line — and there was no exit at
                all from a line the catalog had stopped selling. Undoable from
                the toast rather than guarded by a confirmation. */}
            <div className="mt-3 flex justify-end">
              <ShopButton
                variant="plain"
                className="text-muted-foreground underline decoration-2 underline-offset-4"
                onClick={() => {
                  const removed = rows.map((r) => ({
                    key: r.product.key,
                    quantity: r.quantity,
                  }));
                  clear();
                  toast("Sepet boşaltıldı", {
                    action: {
                      label: "Geri al",
                      onClick: () => {
                        for (const line of removed) addItem(line.key, line.quantity);
                      },
                    },
                  });
                }}
              >
                Sepeti boşalt
              </ShopButton>
            </div>
          </div>
        )}

        {rows.length > 0 ? (
          <SheetFooter className="gap-3 border-t border-border bg-muted pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            {/* Say how THIS basket will arrive before checkout, in one
                sentence, so the delivery restriction is never a surprise at
                the address step. */}
            <p className="flex items-start gap-2.5 text-base leading-snug text-foreground">
              {mode === "route" ? (
                <MapPinIcon className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
              ) : (
                <TruckIcon className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
              )}
              <span>
                {mode === "route"
                  ? `Bu sepet yalnızca ${DELIVERY_PROVINCE} il sınırları içinde, kendi ekibimizle teslim edilir. ${deliveryFeeNotice(deliveryFeeMinor)}`
                  : "Bu sepet kargo ile Türkiye'nin her yerine gönderilebilir."}
              </span>
            </p>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-lg text-foreground">Ara toplam</span>
              <span className="shop-money text-2xl font-extrabold">
                {formatTRY(subtotal)}
              </span>
            </div>
            {minimum.ok ? (
              <ShopLinkButton
                href="/odeme"
                size="lg"
                block
                onClick={() => setOpen(false)}
              >
                Siparişi tamamla
              </ShopLinkButton>
            ) : (
              // Below the cargo floor: say so here rather than letting the
              // customer discover it after filling in the whole checkout.
              <>
                <ShopNotice tone="warning" role="status">
                  {orderMinimumMessage("shipping", cargoMinOrderMinor, minimum.shortfallMinor)}
                </ShopNotice>
                <ShopButton size="lg" block disabled>
                  Siparişi tamamla
                </ShopButton>
              </>
            )}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
