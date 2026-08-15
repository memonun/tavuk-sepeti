import Link from "next/link";

import { isPaytrEnabled } from "@/features/payments/application/paytr";
import { ensureCustomerProfile } from "@/features/storefront/application/ensure-customer-profile";
import { getMyAccount } from "@/features/storefront/application/get-account";
import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import { getStorefrontSettings } from "@/features/storefront/application/get-storefront-settings";
import {
  MAX_DELIVERY_HORIZON_DAYS,
  MIN_DELIVERY_LEAD_DAYS,
} from "@/features/storefront/domain/storefront.config";
import { addDaysIso } from "@/features/storefront/domain/delivery-date";
import {
  formatHomeDeliveryDays,
  listHomeDeliveryDates,
} from "@/features/storefront/domain/delivery-window";
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
  // Self-heal a login whose `customers` row is missing before reading the
  // account. /hesap has always done this; /odeme did not — so such a customer
  // saw an empty address book here, and saving an address failed with P0002
  // ("Profiliniz bulunamadı") no matter how often they refreshed. It is a no-op
  // write once the row exists.
  await ensureCustomerProfile();

  const [catalog, account, settings] = await Promise.all([
    getStorefrontCatalog(),
    getMyAccount(),
    getStorefrontSettings(),
  ]);
  const products = catalog.ok ? catalog.value : [];

  // Only the days the van actually drives, inside the scheduling horizon. The
  // Server Action re-checks both — this list is what the customer picks from,
  // not what decides.
  const today = todayInIstanbul();
  const deliveryDates = listHomeDeliveryDates(
    addDaysIso(today, MIN_DELIVERY_LEAD_DAYS),
    addDaysIso(today, MAX_DELIVERY_HORIZON_DAYS),
    settings.homeDeliveryDays,
  );

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
        deliveryDates={deliveryDates}
        deliveryDaysLabel={formatHomeDeliveryDays(settings.homeDeliveryDays)}
        cargoMinOrderMinor={settings.cargoMinOrderMinor}
        homeMinOrderMinor={settings.homeMinOrderMinor}
        paytrEnabled={isPaytrEnabled()}
        mapsKey={env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY}
      />
    </main>
  );
}
