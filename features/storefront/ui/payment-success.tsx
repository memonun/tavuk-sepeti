"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2Icon, ClockIcon, Loader2Icon } from "lucide-react";

import { checkOrderPaymentState } from "@/features/storefront/application/check-payment-state";

import { useCart } from "@/features/storefront/ui/cart-provider";
import { ShopButton, ShopLinkButton } from "@/features/storefront/ui/kit/shop-button";
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
    <main className="mx-auto max-w-lg px-4 py-10 sm:py-16">
      <div className="flex flex-col items-center gap-5 rounded-3xl border border-border bg-card p-5 text-center shadow-(--shop-shadow-sm) sm:p-8">
        {paid ? (
          <CheckCircle2Icon className="shop-enter-pop size-16 text-primary" aria-hidden />
        ) : gaveUp ? (
          <ClockIcon className="size-16 text-muted-foreground" aria-hidden />
        ) : (
          <Loader2Icon className="size-16 animate-spin text-primary" aria-hidden />
        )}
        <h1 className="font-display text-3xl leading-tight" aria-live="polite">
          {paid ? "Ödemeniz alındı" : "Ödemeniz kontrol ediliyor"}
        </h1>

        {orderNumber ? (
          <div className="flex w-full flex-col items-center gap-2 rounded-2xl bg-(--shop-green-soft) p-4">
            <p className="text-lg text-foreground">Sipariş numaranız</p>
            <p className="shop-money text-3xl font-extrabold tracking-wide break-all select-all">
              {orderNumber}
            </p>
          </div>
        ) : null}

        <p className="text-lg leading-relaxed text-muted-foreground">
          {paid
            ? "Siparişiniz onaylandı ve hazırlanmaya başlanacak. Teşekkürler!"
            : gaveUp
              ? "Bankanızdan onay hâlâ bize ulaşmadı. Tutar kartınızdan çekildiyse siparişiniz kısa süre içinde ödenmiş olarak görünecek — aşağıdan tekrar kontrol edebilir veya bize yazabilirsiniz."
              : "Bankanızdan onay bekleniyor, bu sayfa kendiliğinden güncellenecek. Genellikle birkaç saniye sürer."}
        </p>

        {!paid ? (
          <ShopButton
            variant="secondary"
            size="lg"
            block
            onClick={onManualCheck}
            disabled={checking || !orderNumber}
          >
            {checking ? "Kontrol ediliyor…" : "Durumu tekrar kontrol et"}
          </ShopButton>
        ) : null}

        <div className="flex w-full flex-col gap-3">
          <ShopLinkButton href="/hesap" size="lg" block>
            Siparişlerim
          </ShopLinkButton>
          <ShopLinkButton href="/" size="lg" variant="secondary" block>
            Alışverişe devam et
          </ShopLinkButton>
        </div>
      </div>
    </main>
  );
}
