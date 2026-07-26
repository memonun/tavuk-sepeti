import Link from "next/link";

import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import {
  MAX_DELIVERY_HORIZON_DAYS,
  MIN_DELIVERY_LEAD_DAYS,
} from "@/features/storefront/domain/storefront.config";
import { addDaysIso } from "@/features/storefront/domain/delivery-date";
import { CheckoutForm } from "@/features/storefront/ui/checkout-form";

/** "Today" as a YYYY-MM-DD calendar day in Europe/Istanbul. */
function todayInIstanbul(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function CheckoutPage() {
  const catalog = await getStorefrontCatalog();
  const products = catalog.ok ? catalog.value : [];

  const today = todayInIstanbul();
  const minDate = addDaysIso(today, MIN_DELIVERY_LEAD_DAYS);
  const maxDate = addDaysIso(today, MAX_DELIVERY_HORIZON_DAYS);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <Link
          href="/magaza"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Alışverişe dön
        </Link>
        <h1 className="mt-2 font-display text-3xl">Siparişi tamamla</h1>
      </div>

      <CheckoutForm products={products} minDate={minDate} maxDate={maxDate} />
    </main>
  );
}
