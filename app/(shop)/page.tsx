import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import { CatalogGrid } from "@/features/storefront/ui/catalog-grid";

/**
 * Storefront home: a soft brand hero with a one-line "what we are", then the
 * product catalog. That's the whole shop — catalog + ordering, nothing else.
 *
 * Admins see the shop too (the header shows a "Yönetim" button → /admin); they
 * are not auto-redirected away, so they can preview the storefront.
 */
export default async function ShopHomePage() {
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
