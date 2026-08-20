"use client";

/**
 * Persistent mobile tab bar — the native-app-style anchor for the five things
 * a customer needs to find without being told: the shop, the products, the
 * basket, an existing order, and their account. Present on every storefront
 * page (mounted once by the shop layout), not just the homepage, so a
 * shopper who has navigated away from `/` never loses their way back.
 *
 * Desktop already has all five reachable from the header (`ShopHeader`) plus
 * the hamburger drawer (`MobileNavSheet`), so this bar is `sm:hidden` — a
 * second, redundant nav row would just be more chrome on a screen with room
 * to spare.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HouseIcon, LayoutGridIcon, SearchIcon, UserRoundIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { CartSheet } from "@/features/storefront/ui/cart-sheet";

import type { Product } from "@/features/products/application/list-products";

const itemClass =
  "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 transition-colors active:bg-secondary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function MobileBottomNav({
  products,
  cargoMinOrderMinor,
  authed,
}: {
  products: readonly Product[];
  cargoMinOrderMinor: number;
  authed: boolean;
}) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isAccount = pathname === "/hesap" || pathname.startsWith("/giris");
  const isFindOrder = pathname === "/siparis-sorgula";

  return (
    <nav
      aria-label="Alt gezinme"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:hidden"
    >
      <div className="mx-auto flex max-w-6xl items-stretch justify-between gap-0.5 px-1.5">
        <NavLink href="/" active={isHome} label="Ana Sayfa">
          <HouseIcon className="size-6" aria-hidden />
        </NavLink>
        <NavLink href="/#urunler" active={false} label="Ürünler">
          <LayoutGridIcon className="size-6" aria-hidden />
        </NavLink>
        <CartSheet
          products={products}
          cargoMinOrderMinor={cargoMinOrderMinor}
          variant="tab"
        />
        <NavLink href="/siparis-sorgula" active={isFindOrder} label="Sipariş Sorgula">
          <SearchIcon className="size-6" aria-hidden />
        </NavLink>
        <NavLink
          href={authed ? "/hesap" : "/giris?next=/hesap"}
          active={isAccount}
          label="Hesabım"
        >
          <UserRoundIcon className="size-6" aria-hidden />
        </NavLink>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  active,
  label,
  children,
}: {
  href: string;
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(itemClass, active ? "text-primary" : "text-muted-foreground")}
    >
      {children}
      <span className="text-[11px] leading-none font-semibold">{label}</span>
    </Link>
  );
}
