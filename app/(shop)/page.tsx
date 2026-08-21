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
  FULFILLMENT_NOTICE,
} from "@/features/storefront/domain/storefront.config";
import { CatalogGrid } from "@/features/storefront/ui/catalog-grid";
import { CatalogScopeControls } from "@/features/storefront/ui/catalog-scope-controls";
import { DeliveryScopeHero } from "@/features/storefront/ui/delivery-scope-hero";
import { ProductShowcase } from "@/features/storefront/ui/product-showcase";
import { RecurringOrderTeaser } from "@/features/storefront/ui/recurring-order-teaser";
import { StorefrontScopeSync } from "@/features/storefront/ui/storefront-scope-sync";
import { SupportContactCard } from "@/features/storefront/ui/support-contact-card";
import { TrustHighlights } from "@/features/storefront/ui/trust-highlights";
import { formatTRY } from "@/shared/utils/money";

/**
 * Storefront home, redesigned around one question first: "where are you" —
 * everything else (what you can buy, the recurring-order doorway, the full
 * collection, the fulfilment rules, how to reach us) follows in the order a
 * first-time older shopper needs it, most important decision first.
 *
 * The header already states who this is (logo + brand), so this page skips
 * a second masthead and opens directly on `DeliveryScopeHero` — the actual
 * first decision, not a headline about one.
 *
 * Admins see the shop too (the header shows a "Yönetim" button → /admin); they
 * are not auto-redirected away, so they can preview the storefront.
 *
 * `?teslimat=malatya|kargo` is a pure browsing hint — see `catalog-filter.ts`.
 * It narrows what this page shows; it is never read by checkout or order
 * creation, so a wrong guess here can't affect the real fulfillment decision.
 * `&filtre=` still parses (a stale bookmark from before this redesign should
 * keep working) but nothing on this page links to it any more — the
 * Tümü/Özel/Kargolu sub-filter it drove read as a second, confusing "where
 * are you" question sitting right under the first one.
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

  return (
    <main className="mx-auto max-w-6xl px-4 pt-6 pb-16 sm:px-6 sm:pt-8">
      <Suspense fallback={null}>
        <StorefrontScopeSync />
      </Suspense>

      <DeliveryScopeHero scope={scope} />
      <RecurringOrderTeaser />
      <TrustHighlights homeDeliveryDays={settings.homeDeliveryDays} />

      <div className="mt-10 sm:mt-12">
        {/* Highlights are drawn from the same scope-filtered list as the full
            grid below — a product that isn't sellable under the chosen scope
            never appears here as a tempting dead end either. */}
        <ProductShowcase products={catalogProducts} />
      </div>

      <section
        id="urunler"
        aria-labelledby="catalog-heading"
        className="mt-10 scroll-mt-20 sm:mt-12"
      >
        <h2
          id="catalog-heading"
          className="font-display text-2xl leading-tight tracking-[-0.01em] text-foreground sm:text-3xl"
        >
          Tüm Ürünler
        </h2>
        <div className="mt-5">
          <CatalogScopeControls scope={scope} />
          <CatalogGrid products={catalogProducts} unavailable={!catalog.ok} />
        </div>
      </section>

      {/* Both fulfilment stories, in the owner's own words — when the van
          comes, and what shipping costs. Both are rules the owner edits in
          the admin, so the day list and the minimum are read live rather
          than written into this page. */}
      <section aria-label="Teslimat Bilgisi" className="mt-10 sm:mt-12">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <div className="flex gap-3 rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
            <MapPinIcon className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
            <p className="text-base leading-relaxed text-muted-foreground">
              <strong className="block text-base font-bold text-foreground">
                Malatya Eve Servis
              </strong>
              {FULFILLMENT_NOTICE} Eve servis günlerimiz:{" "}
              <strong className="font-semibold text-foreground">
                {formatHomeDeliveryDays(settings.homeDeliveryDays)}
              </strong>
              .
            </p>
          </div>
          <div className="flex gap-3 rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
            <TruckIcon className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
            <p className="text-base leading-relaxed text-muted-foreground">
              <strong className="block text-base font-bold text-foreground">
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

      <SupportContactCard />
    </main>
  );
}
