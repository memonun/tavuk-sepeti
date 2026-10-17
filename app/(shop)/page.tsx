import type { Metadata } from "next";
import { Suspense } from "react";
import { MapPinIcon, TruckIcon } from "lucide-react";

import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import { getStorefrontSettings } from "@/features/storefront/application/get-storefront-settings";
import {
  filterProductsForScope,
  parseCatalogFilter,
  parseDeliveryScope,
} from "@/features/storefront/domain/catalog-filter";
import { formatHomeDeliveryDays } from "@/features/storefront/domain/delivery-window";
import {
  CARGO_FREE_SHIPPING_NOTICE,
  deliveryFeeNotice,
  FULFILLMENT_NOTICE,
} from "@/features/storefront/domain/storefront.config";
import { CatalogGrid } from "@/features/storefront/ui/catalog-grid";
import { CatalogScopeControls } from "@/features/storefront/ui/catalog-scope-controls";
import { HomeHero } from "@/features/storefront/ui/home-hero";
// "Öne Çıkan Ürünler" vitrini şimdilik UI'dan gizlendi (owner isteği — şu an
// yeterince ürün yok). Bileşen ve veri akışı ileride geri açmak için korunuyor;
// geri açmak için bu importu ve aşağıdaki <ProductShowcase /> bloğunu tekrar aç.
// import { ProductShowcase } from "@/features/storefront/ui/product-showcase";
import { RecurringOrderTeaser } from "@/features/storefront/ui/recurring-order-teaser";
import { StorefrontScopeSync } from "@/features/storefront/ui/storefront-scope-sync";
import { SupportContactCard } from "@/features/storefront/ui/support-contact-card";
import { TrustHighlights } from "@/features/storefront/ui/trust-highlights";
import { formatTRY } from "@/shared/utils/money";

// Title/description come from the shop layout. The canonical lives here, not
// in the layout (a layout canonical would be inherited by every page); it
// folds the `?teslimat=` browsing variants into the one indexable home page.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/**
 * Storefront home. Products first: the header already says who this is, so
 * the page opens on one short line, the single filter the shop has ("where
 * should we deliver") with the weekly standing order beside it, and — on the
 * same first screen — the things for sale. Everything a first-time older
 * shopper might ask next (when the van comes, what shipping costs, how to
 * just phone instead) follows underneath, in that order.
 *
 * Admins see the shop too (the header shows a "Yönetim" button → /admin); they
 * are not auto-redirected away, so they can preview the storefront.
 *
 * `?teslimat=malatya|kargo` is a pure browsing hint — see `catalog-filter.ts`.
 * It narrows what this page shows; it is never read by checkout or order
 * creation, so a wrong guess here can't affect the real fulfillment decision.
 * `&filtre=` still parses (a stale bookmark should keep working) but nothing
 * on this page links to it any more.
 */
export default async function ShopHomePage({
  searchParams,
}: {
  searchParams: Promise<{ teslimat?: string; filtre?: string }>;
}) {
  const params = await searchParams;
  const scope = parseDeliveryScope(params.teslimat);
  const filter = parseCatalogFilter(params.filtre);

  const [catalog, settings] = await Promise.all([
    getStorefrontCatalog(),
    getStorefrontSettings(),
  ]);
  const products = catalog.ok ? catalog.value : [];
  const catalogProducts = filterProductsForScope(products, scope, filter);

  const catalogHeading =
    scope === "malatya"
      ? "Malatya içine getirdiklerimiz"
      : scope === "kargo"
        ? "Kargoyla gönderdiklerimiz"
        : "Tüm ürünlerimiz";

  return (
    <main className="mx-auto max-w-6xl px-4 pt-4 pb-16 sm:px-6 sm:pt-10">
      <Suspense fallback={null}>
        <StorefrontScopeSync />
      </Suspense>

      {/* Phone and tablet: the picture, then the line of text. Desktop: text
          on the left, picture on the right, so the block is no taller than
          the picture and the products below still start on the first
          screen. DOM order keeps the heading first for a screen reader. */}
      <div className="flex flex-col gap-3.5 sm:gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_30rem] lg:items-center lg:gap-10">
        <div className="order-2 lg:order-1">
          {/* On a phone every line above the products costs a row of the
              first screen, and with the picture and the standing-order row
              in place the products had slipped below it. So here the
              heading is one smaller line and the sentence under it waits for
              wider screens. */}
          <h1 className="max-w-3xl font-display text-[1.75rem] leading-[1.1] text-foreground sm:text-5xl sm:leading-[1.05]">
            Çiftlikten sofranıza
          </h1>
          <p className="mt-2.5 hidden max-w-xl text-lg leading-relaxed text-muted-foreground sm:block">
            Akçadağ&apos;daki çiftliğimizden köy yumurtası, kayısı ve dut. Seçin, sepete ekleyin, biz getirelim.
          </p>
        </div>
        <HomeHero className="order-1 lg:order-2" />
      </div>

      {/* `#urunler` is the target of both scope links, so after choosing, the
          page lands with the choice itself (now marked) at the top and the
          products right under it. scroll-mt clears the sticky header. */}
      <section
        id="urunler"
        aria-labelledby="catalog-heading"
        className="mt-4 scroll-mt-24 sm:mt-8"
      >
        {/* The two things decided before looking at products: where it goes,
            and whether it should simply come every week. Stacked on a phone;
            on desktop the standing-order row fills the space beside the two
            delivery buttons and lines up with them. */}
        <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:gap-6">
          <div className="lg:w-[36rem] lg:shrink-0">
            <CatalogScopeControls scope={scope} />
          </div>
          <RecurringOrderTeaser className="lg:flex-1" />
        </div>
        <h2
          id="catalog-heading"
          className="mt-5 font-display text-[1.75rem] leading-tight text-foreground sm:mt-9 sm:text-4xl"
        >
          {catalogHeading}
        </h2>
        <div className="mt-3 sm:mt-5">
          <CatalogGrid products={catalogProducts} unavailable={!catalog.ok} />
        </div>
      </section>

      {/* "Öne Çıkan Ürünler" vitrini şimdilik gizli (owner isteği — şu an az ürün var).
          Arkadaki bileşen (product-showcase.tsx) ve veri akışı korunuyor; geri açmak
          için yukarıdaki importu ve bu bloğu tekrar etkinleştir:

          <div className="mt-10 sm:mt-12">
            <ProductShowcase products={catalogProducts} />
          </div>
      */}

      {/* Both fulfilment stories, in the owner's own words — when the van
          comes, and what shipping costs. Both are rules the owner edits in
          the admin, so the day list and the minimum are read live rather
          than written into this page. */}
      <section aria-label="Teslimat Bilgisi" className="mt-10 sm:mt-12">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <div className="flex gap-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <MapPinIcon className="mt-1 size-7 shrink-0 text-primary" aria-hidden />
            <p className="text-lg leading-relaxed text-muted-foreground">
              <strong className="block text-xl font-bold text-foreground">
                Malatya Eve Servis
              </strong>
              {FULFILLMENT_NOTICE} Eve servis günlerimiz:{" "}
              <strong className="font-semibold text-foreground">
                {formatHomeDeliveryDays(settings.homeDeliveryDays)}
              </strong>
              .{" "}
              <strong className="font-semibold text-foreground">
                {deliveryFeeNotice(settings.homeDeliveryFeeMinor)}
              </strong>
            </p>
          </div>
          <div className="flex gap-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <TruckIcon className="mt-1 size-7 shrink-0 text-primary" aria-hidden />
            <p className="text-lg leading-relaxed text-muted-foreground">
              <strong className="block text-xl font-bold text-foreground">
                Türkiye Geneli Kargo
              </strong>
              {CARGO_FREE_SHIPPING_NOTICE}{" "}
              {settings.cargoMinOrderMinor > 0
                ? `Minimum sipariş tutarı ${formatTRY(settings.cargoMinOrderMinor)}'dir.`
                : null}
            </p>
          </div>
        </div>
      </section>

      <TrustHighlights homeDeliveryDays={settings.homeDeliveryDays} />
      <SupportContactCard />
    </main>
  );
}
