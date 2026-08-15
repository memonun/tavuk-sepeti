"use client";

import Link from "next/link";
import { useEffect } from "react";
import { CheckCircle2Icon, ClockIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useCart } from "@/features/storefront/ui/cart-provider";

import type { OrderPaymentState } from "@/features/storefront/application/get-order-payment-status";

/**
 * Card-payment landing (PayTR `ok_url`).
 *
 * PayTR redirects here regardless of what happened to our server-to-server
 * callback, so this page is a claim about the payment, not evidence of one. It
 * used to state "Ödemeniz alındı!" and empty the basket unconditionally on
 * mount — meaning a failed callback left the customer reassured, basketless and
 * holding an unpaid order, while an ordinary back-button navigation destroyed a
 * freshly built basket. Both now hinge on `paymentState`, read server-side from
 * the order itself.
 */
export function PaymentSuccess({
  orderNumber,
  paymentState,
}: {
  orderNumber: string | null;
  paymentState: OrderPaymentState;
}) {
  const { clear } = useCart();
  const paid = paymentState === "paid";

  // Only a booked payment retires the basket. While the payment is unconfirmed
  // the basket is the customer's only way to re-place the order.
  useEffect(() => {
    if (paid) clear();
  }, [paid, clear]);

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-border/70 bg-card p-8 text-center shadow-sm">
        {paid ? (
          <CheckCircle2Icon className="size-12 text-primary" />
        ) : (
          <ClockIcon className="size-12 text-muted-foreground" />
        )}
        <h1 className="font-display text-2xl">
          {paid ? "Ödemeniz alındı!" : "Ödemeniz kontrol ediliyor"}
        </h1>

        {orderNumber ? (
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm text-muted-foreground">Sipariş numaranız</p>
            <p className="rounded-full bg-secondary px-4 py-1.5 font-mono text-sm font-semibold">
              {orderNumber}
            </p>
          </div>
        ) : null}

        <p className="text-sm text-muted-foreground">
          {paid
            ? "Siparişiniz onaylandı ve hazırlanmaya başlanacak. Teşekkürler!"
            : "Bankanızdan onay henüz bize ulaşmadı. Bu birkaç dakika sürebilir — siparişinizin durumunu hesabınızdan takip edebilirsiniz. Tutar hesabınızdan çekildiği hâlde sipariş ödenmemiş görünüyorsa bize yazın."}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/hesap"
            className={cn(buttonVariants({ size: "lg" }), "rounded-full")}
          >
            Siparişlerim
          </Link>
          <Link
            href="/"
            className={cn(
              buttonVariants({ size: "lg", variant: "outline" }),
              "rounded-full",
            )}
          >
            Alışverişe devam et
          </Link>
        </div>
      </div>
    </main>
  );
}
