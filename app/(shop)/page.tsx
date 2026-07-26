import { redirect } from "next/navigation";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import { CatalogGrid } from "@/features/storefront/ui/catalog-grid";

/**
 * Storefront home: a soft brand hero with a one-line "what we are", then the
 * product catalog. That's the whole shop — catalog + ordering, nothing else.
 *
 * An admin who lands on the public root is sent to their dashboard — anon and
 * customers see the shop. (assertAdmin skips the is_admin() round-trip for anon,
 * so the common case stays cheap.)
 */
export default async function ShopHomePage() {
  const admin = await assertAdmin();
  if (admin.ok) redirect("/admin");

  const catalog = await getStorefrontCatalog();
  const products = catalog.ok ? catalog.value : [];

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
      <section className="py-14 text-center sm:py-20">
        <p className="text-xs font-medium tracking-[0.25em] text-primary uppercase">
          Taze · Günlük · Kapınızda
        </p>
        <h1 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">
          Tavuk Sepeti
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">
          Çiftlikten sofranıza taze yumurta ve süt ürünleri. Sepetinizi
          hazırlayın, teslimat gününü seçin — gerisini biz halledelim.
        </p>
      </section>

      <section aria-labelledby="catalog-heading">
        <h2 id="catalog-heading" className="sr-only">
          Ürünler
        </h2>
        <CatalogGrid products={products} />
      </section>
    </main>
  );
}
