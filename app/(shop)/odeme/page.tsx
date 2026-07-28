import Link from "next/link";

import { isPaytrEnabled } from "@/features/payments/application/paytr";
import { getMyAccount } from "@/features/storefront/application/get-account";
import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import {
  MAX_DELIVERY_HORIZON_DAYS,
  MIN_DELIVERY_LEAD_DAYS,
} from "@/features/storefront/domain/storefront.config";
import { addDaysIso } from "@/features/storefront/domain/delivery-date";
import {
  CheckoutForm,
  type CheckoutDefaults,
} from "@/features/storefront/ui/checkout-form";

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
  const [catalog, account] = await Promise.all([
    getStorefrontCatalog(),
    getMyAccount(),
  ]);
  const products = catalog.ok ? catalog.value : [];

  const today = todayInIstanbul();
  const minDate = addDaysIso(today, MIN_DELIVERY_LEAD_DAYS);
  const maxDate = addDaysIso(today, MAX_DELIVERY_HORIZON_DAYS);

  const defaults: CheckoutDefaults | undefined = account
    ? {
        first_name: account.profile.first_name,
        last_name: account.profile.last_name,
        phone: account.profile.phone,
        email: account.profile.email,
        city: account.address?.city ?? "",
        district: account.address?.district ?? "",
        neighborhood: account.address?.neighborhood ?? "",
        street: account.address?.street ?? "",
        building_no: account.address?.building_no ?? "",
        apartment_no: account.address?.apartment_no ?? "",
        postal_code: account.address?.postal_code ?? "",
        description: account.address?.description ?? "",
      }
    : undefined;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <Link
          href="/"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Alışverişe dön
        </Link>
        <h1 className="mt-2 font-display text-3xl">Siparişi tamamla</h1>
        {account ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Hesabınızdaki bilgiler dolduruldu — kontrol edip gönderin.
          </p>
        ) : null}
      </div>

      <CheckoutForm
        products={products}
        minDate={minDate}
        maxDate={maxDate}
        paytrEnabled={isPaytrEnabled()}
        {...(defaults ? { defaults } : {})}
      />
    </main>
  );
}
