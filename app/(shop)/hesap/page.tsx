import Link from "next/link";
import { redirect } from "next/navigation";

import { customerSignOutAction } from "@/features/storefront/application/customer-auth";
import { ensureCustomerProfile } from "@/features/storefront/application/ensure-customer-profile";
import { getMyAccount } from "@/features/storefront/application/get-account";
import {
  isAwaitingCardConfirmation,
  isAwaitingPayment,
  showsPaidBadge,
} from "@/features/storefront/domain/card-confirmation";
import { formatDeliveryDateLabel } from "@/features/storefront/domain/delivery-window";
import { AccountAddresses } from "@/features/storefront/ui/account-addresses";
import { AccountProfileForm } from "@/features/storefront/ui/account-profile-form";
import { OrderStatusRefresher } from "@/features/storefront/ui/order-status-refresher";
import { ResumePaymentButton } from "@/features/storefront/ui/resume-payment-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { env } from "@/shared/env";
import { formatTRY } from "@/shared/utils/money";

const STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  confirmed: "Onaylandı",
  shipped: "Kargolandı",
  delivered: "Teslim edildi",
  cancelled: "İptal edildi",
};

export default async function AccountPage() {
  // Make sure this login has a linked CRM customer row (self-heals accounts
  // created before customer-linking), then read the account.
  await ensureCustomerProfile();
  const account = await getMyAccount();
  if (!account) redirect("/giris");

  // Card payments are booked by a webhook that lands AFTER this page renders,
  // and nothing else on the storefront re-reads the order. Poll while any card
  // order is still inside its confirmation window so the customer watches it
  // turn "Ödendi" instead of being left on a stale render.
  // Server render time — this page is dynamic (cookies), so every request reads
  // a fresh clock. Same `new Date()` shape the admin pages use for "today".
  const nowMs = new Date().getTime();
  const hasPendingCardOrder = account.orders.some((order) =>
    isAwaitingCardConfirmation(order, nowMs),
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      {hasPendingCardOrder ? <OrderStatusRefresher /> : null}
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl">Hesabım</h1>
        <form action={customerSignOutAction}>
          <Button type="submit" variant="outline" size="lg" className="rounded-full">
            Çıkış yap
          </Button>
        </form>
      </div>

      <div className="mt-6">
        <AccountProfileForm
          firstName={account.profile.first_name}
          lastName={account.profile.last_name}
          phone={account.profile.phone}
          email={account.email}
        />
      </div>

      <AccountAddresses
        addresses={account.addresses}
        mapsKey={env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY}
      />

      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg">Siparişlerim</h2>
        {account.orders.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">Henüz siparişiniz yok.</p>
            <Link
              href="/"
              className={cn(buttonVariants({ size: "lg" }), "mt-4 rounded-full")}
            >
              Alışverişe başla
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {account.orders.map((order) => (
              <li
                key={order.order_number}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 text-sm"
              >
                <div>
                  <p className="font-mono font-medium">{order.order_number}</p>
                  {/* A cargo order never picked a delivery day — `scheduled_for`
                      is the internal preparation date, so printing it as
                      "Teslimat" invented a promise the confirmation e-mail
                      deliberately avoids making. */}
                  <p className="text-muted-foreground">
                    {order.fulfillment_channel === "shipping"
                      ? "Kargo ile gönderilecek"
                      : `Teslimat: ${formatDeliveryDateLabel(order.scheduled_for)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {/* Payment state was fetched and then never rendered, so an
                      abandoned card order — unpaid, and excluded from the van's
                      route — read simply "Onaylandı" to the customer.
                      Cash-on-delivery is excluded: it is unpaid by design until
                      the driver arrives, so flagging it would be noise. */}
                  {isAwaitingCardConfirmation(order, nowMs) ? (
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      Ödeme kontrol ediliyor
                    </span>
                  ) : isAwaitingPayment(order) ? (
                    <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
                      Ödeme bekliyor
                    </span>
                  ) : showsPaidBadge(order) ? (
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      Ödendi
                    </span>
                  ) : null}
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
                    {STATUS_LABELS[order.status] ?? order.status}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatTRY(order.total_minor)}
                  </span>
                </div>
                {order.fulfillment_channel === "shipping" &&
                (order.cargo_carrier ||
                  order.cargo_tracking_number ||
                  order.cargo_tracking_url) ? (
                  <div className="w-full text-xs text-muted-foreground">
                    {[order.cargo_carrier, order.cargo_tracking_number]
                      .filter(Boolean)
                      .join(" · ")}
                    {order.cargo_tracking_url ? (
                      <>
                        {" "}
                        <a
                          href={order.cargo_tracking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2"
                        >
                          Kargo takip
                        </a>
                      </>
                    ) : null}
                  </div>
                ) : null}
                {/* Hidden while the callback may still be in flight: offering
                    "Ödemeyi tamamla" on a card payment that already succeeded
                    is how a customer ends up paying twice. */}
                {isAwaitingPayment(order) && !isAwaitingCardConfirmation(order, nowMs) ? (
                  <div className="w-full sm:w-auto">
                    <ResumePaymentButton
                      orderNumber={order.order_number}
                      // A havale order can still be settled by card; say so
                      // rather than implying it resumes the bank transfer.
                      label={
                        order.payment_method === "credit_card"
                          ? "Ödemeyi tamamla"
                          : "Kartla öde"
                      }
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
