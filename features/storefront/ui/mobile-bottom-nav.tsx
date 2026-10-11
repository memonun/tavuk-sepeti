"use client";

/**
 * Persistent mobile tab bar — the native-app-style anchor for the four things
 * a customer needs to find without being told: the shop, the basket, an
 * existing order, and their account. Present on every storefront
 * page (mounted once by the shop layout), not just the homepage, so a
 * shopper who has navigated away from `/` never loses their way back.
 *
 * A "Ürünler" tab (→ `/#urunler`) used to sit second; it was removed from the
 * UI on owner request while the catalog is small. The full list is still one
 * scroll down the homepage, and the header drawer still links to it.
 *
 * Desktop still reaches every section (products included) from the header
 * (`ShopHeader`) plus the hamburger drawer (`MobileNavSheet`), so this bar is
 * `sm:hidden` — a second, redundant nav row would just be more chrome on a
 * screen with room to spare.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HouseIcon, SearchIcon, UserRoundIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { CartSheet } from "@/features/storefront/ui/cart-sheet";
import { tabItemClass, tabLabelClass } from "@/features/storefront/ui/kit/tab-item";

import type { Product } from "@/features/products/application/list-products";

export function MobileBottomNav({
  products,
  cargoMinOrderMinor,
  deliveryFeeMinor,
  authed,
}: {
  products: readonly Product[];
  cargoMinOrderMinor: number;
  deliveryFeeMinor: number;
  authed: boolean;
}) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isAccount = pathname === "/hesap" || pathname.startsWith("/giris");
  const isFindOrder = pathname === "/siparis-sorgula";
  // On checkout the order summary is already on screen; a second "your
  // basket" strip there would only cover the form.
  const showCartBar = !pathname.startsWith("/odeme");

  return (
    <nav
      aria-label="Alt gezinme"
      className="shop-glass fixed inset-x-0 bottom-0 z-40 border-t border-border pb-[env(safe-area-inset-bottom,0px)] sm:hidden"
    >
      {showCartBar ? (
        <CartSheet
          products={products}
          cargoMinOrderMinor={cargoMinOrderMinor}
          deliveryFeeMinor={deliveryFeeMinor}
          variant="bar"
        />
      ) : null}
      <div className="mx-auto flex max-w-6xl items-stretch justify-between gap-0.5 px-1.5 py-1">
        <NavLink href="/" active={isHome} label="Ana Sayfa">
          <HouseIcon className="size-7" aria-hidden />
        </NavLink>
        <CartSheet
          products={products}
          cargoMinOrderMinor={cargoMinOrderMinor}
          deliveryFeeMinor={deliveryFeeMinor}
          variant="tab"
        />
        <NavLink href="/siparis-sorgula" active={isFindOrder} label="Sipariş Sorgula">
          <SearchIcon className="size-7" aria-hidden />
        </NavLink>
        <NavLink
          href={authed ? "/hesap" : "/giris?next=/hesap"}
          active={isAccount}
          label="Hesabım"
        >
          <UserRoundIcon className="size-7" aria-hidden />
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
      className={cn(
        tabItemClass,
        // Colour alone would not tell an older eye which tab is current, so
        // the active one also gets a filled pill behind it.
        active ? "bg-(--shop-green-soft) text-primary" : "text-foreground",
      )}
    >
      {children}
      <span className={tabLabelClass}>{label}</span>
    </Link>
  );
}
