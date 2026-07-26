"use client";

import Link from "next/link";
import { useState } from "react";
import { ShoppingBasketIcon } from "lucide-react";

import { cartSubtotalMinor } from "@/features/storefront/domain/cart";
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
export function CartSheet({ products }: { products: readonly Product[] }) {
  const { lines, lineCount, hydrated } = useCart();
  const [open, setOpen] = useState(false);

  const rows = lines.flatMap((line) => {
    const product = products.find((p) => p.key === line.product_key);
    return product ? [{ product, quantity: line.quantity }] : [];
  });

  const subtotal = cartSubtotalMinor(
    rows.map((r) => lineTotalMinor(r.product, r.quantity)),
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
          </div>
        )}

        {rows.length > 0 ? (
          <SheetFooter className="border-t border-border/60">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Ara toplam</span>
              <span className="font-semibold tabular-nums">
                {formatTRY(subtotal)}
              </span>
            </div>
            <Link
              href="/odeme"
              onClick={() => setOpen(false)}
              className={cn(buttonVariants({ size: "lg" }), "w-full rounded-full")}
            >
              Siparişi tamamla
            </Link>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
