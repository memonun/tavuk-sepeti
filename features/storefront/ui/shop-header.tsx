import Image from "next/image";
import Link from "next/link";
import { HouseIcon, SearchIcon } from "lucide-react";

import { AccountNav } from "@/features/storefront/ui/account-nav";
import { CartSheet } from "@/features/storefront/ui/cart-sheet";
import { MobileNavSheet } from "@/features/storefront/ui/mobile-nav-sheet";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { Product } from "@/features/products/application/list-products";

/**
 * Sticky storefront header. Three columns so the brand mark stays visually
 * centred at every width: hamburger (mobile only) + full nav (desktop) on the
 * left, mark in the middle, basket on the right — matching the plain,
 * three-item header of a native shopping app on a phone, while desktop keeps
 * every link reachable without opening anything.
 *
 * Data (viewer + settings) is fetched once by the shop layout and passed down
 * — this used to fetch its own copy, which meant every render paid for a
 * second `getUser` + settings read alongside the one `MobileBottomNav` needs.
 */
export function ShopHeader({
  products,
  cargoMinOrderMinor,
  authed,
  isAdmin,
}: {
  products: readonly Product[];
  cargoMinOrderMinor: number;
  authed: boolean;
  isAdmin: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-2 sm:px-6">
        <div className="flex items-center justify-start gap-1">
          <MobileNavSheet authed={authed} isAdmin={isAdmin} />
          <div className="hidden items-center gap-1 sm:flex">
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
          </div>
        </div>

        <Link href="/" className="flex items-center justify-center gap-2">
          <Image
            src="/brand/apuhan-logo.png"
            alt=""
            width={36}
            height={36}
            priority
            className="size-9 shrink-0 rounded-xl"
          />
          <span className="font-display text-lg font-semibold tracking-tight text-foreground">
            Apuhan Çiftliği
          </span>
        </Link>

        <div className="flex items-center justify-end gap-1">
          <div className="hidden sm:flex">
            <AccountNav authed={authed} isAdmin={isAdmin} />
          </div>
          <CartSheet products={products} cargoMinOrderMinor={cargoMinOrderMinor} />
        </div>
      </div>
    </header>
  );
}
