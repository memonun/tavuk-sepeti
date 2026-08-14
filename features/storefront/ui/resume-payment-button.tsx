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
import { Button } from "@/components/ui/button";

const initialState: ResumePaymentState = { status: "idle" };

export function ResumePaymentButton({
  orderNumber,
  label,
}: {
  orderNumber: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(
    resumeCardPaymentAction,
    initialState,
  );

  useEffect(() => {
    if (state.status === "redirect") window.location.href = state.url;
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="order_number" value={orderNumber} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        className="rounded-full"
        disabled={pending || state.status === "redirect"}
      >
        {pending || state.status === "redirect" ? "Yönlendiriliyor…" : label}
      </Button>
      {state.status === "error" ? (
        <p className="text-xs text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
