import Link from "next/link";

import { listActiveProducts } from "@/features/products/application/list-products";
import { OrderForm } from "@/features/orders/ui/order-form";
import { toIstanbulDateString } from "@/shared/utils/date";

export default async function NewOrderPage() {
  const productsResult = await listActiveProducts();
  if (!productsResult.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Ürün katalogu yüklenemedi: {productsResult.error.message}
      </div>
    );
  }

  const today = toIstanbulDateString(new Date());

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href="/orders" className="hover:underline">
            ← Siparişler
          </Link>
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">Yeni Sipariş</h2>
        <p className="text-sm text-muted-foreground">
          Müşteri seç, ürünleri ekle, tarihi ayarla.
        </p>
      </div>

      <OrderForm products={productsResult.value} defaultScheduledFor={today} />
    </div>
  );
}
