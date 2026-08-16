import { MapPinIcon, TruckIcon } from "lucide-react";

import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import { getStorefrontSettings } from "@/features/storefront/application/get-storefront-settings";
import { formatHomeDeliveryDays } from "@/features/storefront/domain/delivery-window";
import { orderMinimumNotice } from "@/features/storefront/domain/order-minimum";
import {
  CARGO_FREE_SHIPPING_NOTICE,
  FULFILLMENT_NOTICE,
} from "@/features/storefront/domain/storefront.config";
import { CatalogGrid } from "@/features/storefront/ui/catalog-grid";
import { ProductShowcase } from "@/features/storefront/ui/product-showcase";

/**
 * Storefront home: a compact masthead, the vitrine (shop window), the fulfilment
 * rules, then the full collection. That's the whole shop — catalog + ordering,
 * nothing else.
 *
 * The brand block is deliberately small. The products carry the first
 * impression, so the masthead states who this is and gets out of the way rather
 * than spending the first screen on a headline.
 *
 * Admins see the shop too (the header shows a "Yönetim" button → /admin); they
 * are not auto-redirected away, so they can preview the storefront.
 */
export default async function ShopHomePage() {
  const [catalog, settings] = await Promise.all([
    getStorefrontCatalog(),
    getStorefrontSettings(),
  ]);
  const products = catalog.ok ? catalog.value : [];

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <section
        data-enter
        className="flex flex-col gap-5 pt-10 pb-9 sm:pt-14 sm:pb-12 lg:flex-row lg:items-end lg:justify-between lg:gap-12"
      >
        <div>
          <p className="text-[0.7rem] font-medium tracking-[0.25em] text-primary uppercase">
            Taze · Günlük · Kapınızda
          </p>
          <h1 className="mt-3 font-display text-3xl leading-[1.05] tracking-[-0.02em] sm:text-4xl">
            Apuhan Çiftliği
          </h1>
        </div>
        <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground lg:text-right">
          Çiftlikten sofranıza taze yumurta ve süt ürünleri. Sepetinizi
          hazırlayın, teslimat gününü seçin — gerisini biz halledelim.
        </p>
      </section>

      <ProductShowcase products={products} />

      {/* Both fulfilment stories, stated up front: when the van comes, and what
          shipping costs. Both are rules the owner edits in the admin. Set as a
          hairline band rather than a boxed callout so it reads as part of the
          same page, not a wall between the window and the shelves. */}
      <div className="mt-14 flex flex-col gap-3 border-y border-border/70 py-5 text-sm text-muted-foreground sm:mt-16 sm:flex-row sm:gap-10">
        <p className="flex flex-1 items-start gap-2.5">
          <MapPinIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            <strong className="font-bold text-foreground">
              {FULFILLMENT_NOTICE}
            </strong>{" "}
            Eve servis günlerimiz:{" "}
            <strong className="font-medium text-foreground">
              {formatHomeDeliveryDays(settings.homeDeliveryDays)}
            </strong>
            .
          </span>
        </p>
        <p className="flex flex-1 items-start gap-2.5">
          <TruckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            {CARGO_FREE_SHIPPING_NOTICE}{" "}
            {settings.cargoMinOrderMinor > 0
              ? orderMinimumNotice("shipping", settings.cargoMinOrderMinor)
              : null}
          </span>
        </p>
      </div>

      <section aria-labelledby="catalog-heading" className="mt-14 sm:mt-16">
        <h2 id="catalog-heading" className="sr-only">
          Ürünler
        </h2>
        <CatalogGrid products={products} unavailable={!catalog.ok} />
      </section>
    </main>
  );
}
