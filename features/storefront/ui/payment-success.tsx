"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2Icon, ClockIcon, Loader2Icon } from "lucide-react";

import { checkOrderPaymentState } from "@/features/storefront/application/check-payment-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useCart } from "@/features/storefront/ui/cart-provider";
import { clearCheckoutDraft } from "@/features/storefront/ui/use-checkout-draft";

import type { OrderPaymentState } from "@/features/storefront/application/get-order-payment-status";

/**
 * Card-payment landing (PayTR `ok_url`).
 *
 * PayTR redirects here regardless of what happened to our server-to-server
 * callback, so this page is a claim about the payment, not evidence of one. It
 * used to state "Ödemeniz alındı!" and empty the basket unconditionally on
 * mount — meaning a failed callback left the customer reassured, basketless and
 * holding an unpaid order, while an ordinary back-button navigation destroyed a
 * freshly built basket.
 *
 * The server render fixed that but introduced the opposite problem: the
 * redirect BEATS the callback almost every time (measured in production at
 * ~1 minute between order creation and the ledger row), so a perfectly good
 * payment rendered "Ödemeniz kontrol ediliyor" and stayed that way — nothing on
 * the storefront ever re-read the order. The admin panel, which subscribes to
 * Postgres changes, flipped to "Ödendi" seconds later; the customer's own page
 * never did. That mismatch is what this polling closes.
 */

/** ~2 minutes at 2s. Comfortably longer than any callback we've observed, and
 *  bounded so an order that genuinely failed stops spinning and says so. */
const POLL_INTERVAL_MS = 2_000;
const MAX_POLLS = 60;

export function PaymentSuccess({
  orderNumber,
  returnToken,
  initialPaymentState,
}: {
  orderNumber: string | null;
  returnToken: string | null;
  initialPaymentState: OrderPaymentState;
}) {
  const { clear } = useCart();
  const [paymentState, setPaymentState] =
    useState<OrderPaymentState>(initialPaymentState);
  const [checking, setChecking] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const paid = paymentState === "paid";

  // Only a booked payment retires the basket and the saved checkout draft.
  // While the payment is unconfirmed the basket is the customer's only way to
  // re-place the order, and the draft keeps their details for that retry.
  useEffect(() => {
    if (paid) {
      clear();
      clearCheckoutDraft();
    }
  }, [paid, clear]);

  const check = useCallback(async (): Promise<OrderPaymentState> => {
    if (!orderNumber) return "unknown";
    const next = await checkOrderPaymentState({ orderNumber, returnToken });
    setPaymentState(next);
    return next;
  }, [orderNumber, returnToken]);

  // Poll until the callback books the payment. Stops on success, on running out
  // of attempts, and on unmount — never leaves a timer behind.
  const polls = useRef(0);
  useEffect(() => {
    if (paid || !orderNumber) return;

    let cancelled = false;
    const timer = setInterval(() => {
      if (cancelled) return;
      polls.current += 1;
      if (polls.current > MAX_POLLS) {
        clearInterval(timer);
        setGaveUp(true);
        return;
      }
      void check();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [paid, orderNumber, check]);

  const onManualCheck = useCallback(() => {
    setChecking(true);
    void check().finally(() => {
      setChecking(false);
      setGaveUp(false);
      polls.current = 0;
    });
  }, [check]);

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-border/70 bg-card p-8 text-center shadow-sm">
        {paid ? (
          <CheckCircle2Icon className="size-12 text-primary" />
        ) : gaveUp ? (
          <ClockIcon className="size-12 text-muted-foreground" />
        ) : (
          <Loader2Icon className="size-12 animate-spin text-muted-foreground" />
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
            : gaveUp
              ? "Bankanızdan onay hâlâ bize ulaşmadı. Tutar kartınızdan çekildiyse siparişiniz kısa süre içinde ödenmiş olarak görünecek — aşağıdan tekrar kontrol edebilir veya bize yazabilirsiniz."
              : "Bankanızdan onay bekleniyor, bu sayfa kendiliğinden güncellenecek. Genellikle birkaç saniye sürer."}
        </p>

        {!paid ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="rounded-full"
            onClick={onManualCheck}
            disabled={checking || !orderNumber}
          >
            {checking ? "Kontrol ediliyor…" : "Durumu tekrar kontrol et"}
          </Button>
        ) : null}

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
