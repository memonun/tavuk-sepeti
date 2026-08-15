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

/**
 * Storefront home: a soft brand hero with a one-line "what we are", then the
 * product catalog. That's the whole shop — catalog + ordering, nothing else.
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
    <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
      <section className="py-14 text-center sm:py-20">
        <p className="text-xs font-medium tracking-[0.25em] text-primary uppercase">
          Taze · Günlük · Kapınızda
        </p>
        <h1 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">
          Apuhan Çiftliği
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">
          Çiftlikten sofranıza taze yumurta ve süt ürünleri. Sepetinizi
          hazırlayın, teslimat gününü seçin — gerisini biz halledelim.
        </p>
      </section>

      {/* Both fulfilment stories, stated up front: when the van comes, and what
          shipping costs. Both are rules the owner edits in the admin. */}
      <div className="mx-auto mb-10 flex max-w-2xl flex-col gap-2.5 rounded-2xl border border-border/60 bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
        <p className="flex items-start gap-2.5">
          <MapPinIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            {FULFILLMENT_NOTICE} Eve servis günlerimiz:{" "}
            <strong className="font-medium text-foreground">
              {formatHomeDeliveryDays(settings.homeDeliveryDays)}
            </strong>
            .
          </span>
        </p>
        <p className="flex items-start gap-2.5">
          <TruckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            {CARGO_FREE_SHIPPING_NOTICE}{" "}
            {settings.cargoMinOrderMinor > 0
              ? orderMinimumNotice("shipping", settings.cargoMinOrderMinor)
              : null}
          </span>
        </p>
      </div>

      <section aria-labelledby="catalog-heading">
        <h2 id="catalog-heading" className="sr-only">
          Ürünler
        </h2>
        <CatalogGrid products={products} unavailable={!catalog.ok} />
      </section>
    </main>
  );
}
