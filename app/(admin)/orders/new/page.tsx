import Link from "next/link";

import { BulkOrderScreen } from "@/features/orders/ui/bulk-order-screen";
import { listActiveProducts } from "@/features/products/application/list-products";
import { env } from "@/shared/env";
import { toIstanbulDateString } from "@/shared/utils/date";

import { NewCustomerAction } from "@/app/(admin)/_components/new-customer-action";

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
  const mapsKey = env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href="/orders" className="hover:underline">
            ← Siparişler
          </Link>
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">Sipariş Oluştur</h2>
        <p className="text-sm text-muted-foreground">
          Soldan müşterileri seç, sağdan ortak sepeti kur, topluca oluştur.
        </p>
      </div>

      <BulkOrderScreen
        products={productsResult.value}
        today={today}
        newCustomerSlot={
          mapsKey ? <NewCustomerAction mapsBrowserKey={mapsKey} /> : undefined
        }
      />
    </div>
  );
}
