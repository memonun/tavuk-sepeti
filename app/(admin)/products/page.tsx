import { listAllProducts } from "@/features/products/application/list-products";
import { ProductsAdmin } from "@/features/products/ui/products-admin";

export default async function ProductsPage() {
  const result = await listAllProducts();
  if (!result.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Ürünler yüklenemedi: {result.error.message}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Ürünler</h2>
        <p className="text-sm text-muted-foreground">
          Katalogu yönet: ürün ekle, ad / birim / miktar kurallarını ve fiyatları
          düzenle, ürünleri arşivle. Değişiklikler yalnızca yeni siparişleri
          etkiler.
        </p>
      </div>
      <ProductsAdmin products={result.value} />
    </div>
  );
}
