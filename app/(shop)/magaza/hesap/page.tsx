import Link from "next/link";
import { redirect } from "next/navigation";

import { customerSignOutAction } from "@/features/storefront/application/customer-auth";
import { getMyAccount } from "@/features/storefront/application/get-account";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatTRY } from "@/shared/utils/money";
import { formatTRPhone } from "@/shared/utils/phone";

const STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  confirmed: "Onaylandı",
  delivered: "Teslim edildi",
  cancelled: "İptal edildi",
};

export default async function AccountPage() {
  const account = await getMyAccount();
  if (!account) redirect("/magaza/giris");

  const fullName = `${account.profile.first_name} ${account.profile.last_name}`.trim();

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl">Hesabım</h1>
        <form action={customerSignOutAction}>
          <Button type="submit" variant="outline" size="lg" className="rounded-full">
            Çıkış yap
          </Button>
        </form>
      </div>

      <section className="mt-6 rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
        <h2 className="font-display text-lg">Bilgilerim</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Ad Soyad</dt>
            <dd>{fullName || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">E-posta</dt>
            <dd>{account.email || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Telefon</dt>
            <dd>{account.profile.phone ? formatTRPhone(account.profile.phone) : "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg">Siparişlerim</h2>
        {account.orders.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">Henüz siparişiniz yok.</p>
            <Link
              href="/magaza"
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
                  <p className="text-muted-foreground">
                    Teslimat: {order.scheduled_for}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
                    {STATUS_LABELS[order.status] ?? order.status}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatTRY(order.total_minor)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
