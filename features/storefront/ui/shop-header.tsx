import Link from "next/link";
import { HouseIcon, SearchIcon } from "lucide-react";

import { getViewer } from "@/features/auth/application/get-viewer";
import { getStorefrontSettings } from "@/features/storefront/application/get-storefront-settings";

import { AccountNav } from "@/features/storefront/ui/account-nav";
import { CartSheet } from "@/features/storefront/ui/cart-sheet";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { Product } from "@/features/products/application/list-products";

/** Sticky storefront header: brand mark + account (+ admin panel button) + basket. */
export async function ShopHeader({ products }: { products: readonly Product[] }) {
  // The basket states the cargo order floor before the customer reaches
  // checkout — finding out at the last step that the basket is too small is the
  // dead end this avoids. The read is cached + tagged, so this is not a query
  // per page view.
  const [{ authed, isAdmin }, settings] = await Promise.all([
    getViewer(),
    getStorefrontSettings(),
  ]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            🧺
          </span>
          <span className="font-display text-lg font-semibold tracking-tight text-foreground">
            Apuhan Çiftliği
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/"
            className={cn(
              buttonVariants({ variant: "ghost", size: "lg" }),
              "rounded-full",
            )}
            title="Anasayfa"
          >
            <HouseIcon />
            <span className="hidden sm:inline">Anasayfa</span>
          </Link>
          <Link
            href="/siparis-sorgula"
            className={cn(
              buttonVariants({ variant: "ghost", size: "lg" }),
              "rounded-full",
            )}
            title="Siparişi sorgula"
          >
            <SearchIcon />
            <span className="hidden sm:inline">Sipariş Sorgula</span>
          </Link>
          <AccountNav authed={authed} isAdmin={isAdmin} />
          <CartSheet
            products={products}
            cargoMinOrderMinor={settings.cargoMinOrderMinor}
          />
        </div>
      </div>
    </header>
  );
}
