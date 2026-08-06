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
  type CheckoutIdentityDefaults,
} from "@/features/storefront/ui/checkout-form";
import { env } from "@/shared/env";

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
  // Deliberately NOT redirecting an anonymous visitor: an account is required to
  // place an order, but it is created inside the checkout form itself so a full
  // basket is never bounced to a login page.
  const [catalog, account] = await Promise.all([
    getStorefrontCatalog(),
    getMyAccount(),
  ]);
  const products = catalog.ok ? catalog.value : [];

  const today = todayInIstanbul();
  const minDate = addDaysIso(today, MIN_DELIVERY_LEAD_DAYS);
  const maxDate = addDaysIso(today, MAX_DELIVERY_HORIZON_DAYS);

  const identity: CheckoutIdentityDefaults | null = account
    ? {
        first_name: account.profile.first_name,
        last_name: account.profile.last_name,
        phone: account.profile.phone,
        email: account.profile.email,
      }
    : null;

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
      </div>

      <CheckoutForm
        products={products}
        addresses={account?.addresses ?? []}
        identity={identity}
        minDate={minDate}
        maxDate={maxDate}
        paytrEnabled={isPaytrEnabled()}
        mapsKey={env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY}
      />
    </main>
  );
}
