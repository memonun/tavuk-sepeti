import { XCircleIcon } from "lucide-react";

import { ShopLinkButton } from "@/features/storefront/ui/kit/shop-button";

export default async function PaymentFailedPage({
  searchParams,
}: {
  searchParams: Promise<{ no?: string }>;
}) {
  const { no } = await searchParams;
  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:py-16">
      <div className="flex flex-col items-center gap-5 rounded-3xl border border-border bg-card p-5 text-center shadow-(--shop-shadow-sm) sm:p-8">
        <XCircleIcon className="size-16 text-destructive" aria-hidden />
        <h1 className="font-display text-3xl leading-tight">Ödeme tamamlanamadı</h1>
        {no ? (
          <p className="text-lg text-foreground">
            Sipariş numaranız:{" "}
            <span className="shop-money font-bold select-all">{no}</span>
            <br />
            Ödeme bekliyor.
          </p>
        ) : null}
        <p className="text-lg leading-relaxed text-muted-foreground">
          Ödemeniz alınamadı ve tutar hesabınızdan çekilmedi. Siparişiniz
          kaydedildi. Ödemesini hesabınızdan tamamlayabilir veya bize yazıp
          havale ile ödeyebilirsiniz.
        </p>
        {/* Deliberately NOT /odeme. That re-runs the whole checkout action and
            writes a SECOND order: the production data shows one customer
            placing four card orders in four minutes this way, and two others
            re-placing the identical basket as havale after the card failed. */}
        <div className="flex w-full flex-col gap-3">
          <ShopLinkButton href="/hesap" size="lg" block>
            Siparişlerime git
          </ShopLinkButton>
          <ShopLinkButton href="/" size="lg" variant="secondary" block>
            Alışverişe dön
          </ShopLinkButton>
        </div>
      </div>
    </main>
  );
}
