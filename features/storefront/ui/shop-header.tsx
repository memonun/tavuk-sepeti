import Link from "next/link";

import { CartSheet } from "@/features/storefront/ui/cart-sheet";

import type { Product } from "@/features/products/application/list-products";

/** Sticky storefront header: brand mark + basket. */
export function ShopHeader({ products }: { products: readonly Product[] }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/magaza" className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            🧺
          </span>
          <span className="font-display text-lg font-semibold tracking-tight text-foreground">
            Tavuk Sepeti
          </span>
        </Link>
        <CartSheet products={products} />
      </div>
    </header>
  );
}
