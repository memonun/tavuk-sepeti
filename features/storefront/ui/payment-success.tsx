"use client";

import Link from "next/link";
import { useEffect } from "react";
import { CheckCircle2Icon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useCart } from "@/features/storefront/ui/cart-provider";

/** Card-payment success landing (PayTR ok_url). Clears the basket now that the
 *  payment is confirmed. */
export function PaymentSuccess({ orderNumber }: { orderNumber: string | null }) {
  const { clear } = useCart();
  useEffect(() => {
    clear();
  }, [clear]);

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-border/70 bg-card p-8 text-center shadow-sm">
        <CheckCircle2Icon className="size-12 text-primary" />
        <h1 className="font-display text-2xl">Ödemeniz alındı!</h1>
        {orderNumber ? (
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm text-muted-foreground">Sipariş numaranız</p>
            <p className="rounded-full bg-secondary px-4 py-1.5 font-mono text-sm font-semibold">
              {orderNumber}
            </p>
          </div>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Siparişiniz onaylandı ve hazırlanmaya başlanacak. Teşekkürler!
        </p>
        <Link
          href="/"
          className={cn(buttonVariants({ size: "lg" }), "rounded-full")}
        >
          Alışverişe devam et
        </Link>
      </div>
    </main>
  );
}
