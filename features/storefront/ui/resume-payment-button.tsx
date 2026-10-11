"use client";

/**
 * "Ödemeyi tamamla" on an unpaid order in Siparişlerim.
 *
 * The point is that it pays THIS order. The failure page used to send people to
 * /odeme, which re-runs checkout and writes a second order — the duplicate
 * clusters visible in production all start there.
 */
import { useActionState, useEffect } from "react";

import {
  resumeCardPaymentAction,
  type ResumePaymentState,
} from "@/features/storefront/application/resume-card-payment";
import { ShopButton } from "@/features/storefront/ui/kit/shop-button";

const initialState: ResumePaymentState = { status: "idle" };

export function ResumePaymentButton({
  orderNumber,
  label,
  /** Guest authorization. Omitted on /hesap, where the session proves ownership;
   *  supplied on the order-lookup page, where there is no session to prove it. */
  phone,
}: {
  orderNumber: string;
  label: string;
  phone?: string | undefined;
}) {
  const [state, formAction, pending] = useActionState(
    resumeCardPaymentAction,
    initialState,
  );

  useEffect(() => {
    if (state.status === "redirect") window.location.href = state.url;
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <input type="hidden" name="order_number" value={orderNumber} />
      {phone ? <input type="hidden" name="phone" value={phone} /> : null}
      <ShopButton
        type="submit"
        disabled={pending || state.status === "redirect"}
      >
        {pending || state.status === "redirect" ? "Yönlendiriliyor…" : label}
      </ShopButton>
      {state.status === "error" ? (
        <p className="text-base font-semibold text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
