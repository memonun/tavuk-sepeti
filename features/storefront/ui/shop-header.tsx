import Image from "next/image";
import Link from "next/link";

import { TRUST_PAGES_PUBLISHED } from "@/features/content/application/trust-pages-visibility";
import { AccountNav } from "@/features/storefront/ui/account-nav";
import { CartSheet } from "@/features/storefront/ui/cart-sheet";
import { ShopLinkButton } from "@/features/storefront/ui/kit/shop-button";
import { MobileNavSheet } from "@/features/storefront/ui/mobile-nav-sheet";

import type { Product } from "@/features/products/application/list-products";

/**
 * Sticky storefront header: who this is on the left, where you can go on the
 * right — the arrangement every shop and every phone app already taught the
 * customer, so nothing here has to be learned.
 *
 *   phone  (<640)      brand · "Menü"            (basket lives in the tab bar)
 *   tablet (640–1279)  brand · basket · "Menü"
 *   desktop (≥1280)    brand · links · account · basket
 *
 * The inline links wait for `xl`: with Çiftliğimiz and Hakkımızda there are
 * seven of them, and below 1280 they no longer fit beside the name (measured
 * on the live header). The header row is capped at `max-w-6xl`, so a wider
 * screen buys no extra room — hence the tighter `px-3` on the links too.
 *
 * Every control carries its name in words; none is an icon alone. The bar is
 * a translucent layer the page scrolls under (`.shop-glass`), and pads itself
 * past the notch.
 *
 * Data (viewer + settings) is fetched once by the shop layout and passed down
 * — this used to fetch its own copy, which meant every render paid for a
 * second `getUser` + settings read alongside the one `MobileBottomNav` needs.
 */
export function ShopHeader({
  products,
  cargoMinOrderMinor,
  deliveryFeeMinor,
  authed,
  isAdmin,
}: {
  products: readonly Product[];
  cargoMinOrderMinor: number;
  deliveryFeeMinor: number;
  authed: boolean;
  isAdmin: boolean;
}) {
  return (
    <header className="shop-glass sticky top-0 z-40 border-b border-border pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:h-[4.5rem]">
        <Link
          href="/"
          aria-label="Apuhan Çiftliği, ana sayfa"
          className="shop-focus flex min-h-12 min-w-0 items-center gap-2.5 rounded-xl"
        >
          {/* The round farm badge. Its own lettering is unreadable at this
              size, which is why the name is also set in type beside it. */}
          <Image
            src="/brand/apuhan-ciftligi-logo.png"
            alt=""
            width={56}
            height={56}
            priority
            className="size-12 shrink-0 rounded-full lg:size-14"
          />
          <span className="truncate font-display text-lg leading-none text-foreground min-[360px]:text-xl sm:text-[1.375rem]">
            Apuhan Çiftliği
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <nav aria-label="Ana gezinme" className="hidden items-center gap-1 xl:flex [&_.shop-btn]:px-3">
            <ShopLinkButton href="/" variant="plain">
              Ana Sayfa
            </ShopLinkButton>
            {TRUST_PAGES_PUBLISHED ? (
              <>
                <ShopLinkButton href="/hakkimizda" variant="plain">
                  Hakkımızda
                </ShopLinkButton>
                <ShopLinkButton href="/ciftligimiz" variant="plain">
                  Çiftliğimiz
                </ShopLinkButton>
              </>
            ) : null}
            <ShopLinkButton href="/tarifler" variant="plain">
              Tarifler
            </ShopLinkButton>
            <ShopLinkButton href="/siparis-sorgula" variant="plain">
              Sipariş Sorgula
            </ShopLinkButton>
            <AccountNav authed={authed} isAdmin={isAdmin} />
          </nav>
          <div className="hidden sm:block">
            <CartSheet
              products={products}
              cargoMinOrderMinor={cargoMinOrderMinor}
              deliveryFeeMinor={deliveryFeeMinor}
            />
          </div>
          <MobileNavSheet authed={authed} isAdmin={isAdmin} />
        </div>
      </div>
    </header>
  );
}
