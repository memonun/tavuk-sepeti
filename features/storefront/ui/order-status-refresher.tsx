"use client";

/**
 * Re-renders "Siparişlerim" while a card payment is still being confirmed.
 *
 * The admin grid has had this since day one — `use-orders-realtime` subscribes
 * to Postgres changes and calls `router.refresh()`. The storefront had no
 * equivalent, so /hesap showed whatever was true when the page was rendered.
 * A customer arriving straight from PayTR renders BEFORE the callback books the
 * payment, and their order then sat at "Ödeme bekliyor" while the admin panel
 * showed "Ödendi" — the same row, two answers, because only one side ever
 * re-read it.
 *
 * A poll rather than a realtime subscription: the storefront client is
 * anonymous, and opening a realtime channel for it would mean widening RLS on
 * `orders` for a page that needs one boolean. This mounts only while an order
 * is actually awaiting confirmation and stops on its own.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 5s × 24 = 2 minutes, then stop. Long enough for any callback we've seen,
 *  short enough that an abandoned tab isn't polling forever. */
const REFRESH_INTERVAL_MS = 5_000;
const MAX_REFRESHES = 24;

export function OrderStatusRefresher() {
  const router = useRouter();

  useEffect(() => {
    let refreshes = 0;
    const timer = setInterval(() => {
      refreshes += 1;
      if (refreshes > MAX_REFRESHES) {
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [router]);

  return null;
}
