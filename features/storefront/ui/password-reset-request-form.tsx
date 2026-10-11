"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  requestPasswordResetAction,
  type PasswordResetRequestState,
} from "@/features/storefront/application/customer-auth";
import { ShopButton } from "@/features/storefront/ui/kit/shop-button";
import { ShopInput } from "@/features/storefront/ui/kit/shop-field";

const initialState: PasswordResetRequestState = { status: "idle" };

/** "Forgot password" request form — emails a reset link. */
export function PasswordResetRequestForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    initialState,
  );

  if (state.status === "sent") {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 text-center shadow-(--shop-shadow-sm)">
        <h2 className="font-display text-2xl leading-tight">Bağlantı gönderildi</h2>
        <p className="mt-2 text-base text-muted-foreground">
          Bu e-posta kayıtlıysa, şifre sıfırlama bağlantısı gönderdik. Gelen
          kutunuzu (ve spam klasörünü) kontrol edin.
        </p>
        <Link
          href="/giris"
          className="inline-flex min-h-11 items-center mt-4 inline-block text-base text-primary underline underline-offset-4"
        >
          Girişe dön
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        <label className="text-base font-bold text-foreground" htmlFor="email">E-posta</label>
        <ShopInput
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
        />
      </div>

      {state.status === "error" ? (
        <p className="text-base text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}

      <ShopButton
        type="submit" size="lg" block
        disabled={pending}
      >
        {pending ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}
      </ShopButton>

      <p className="text-center text-base text-muted-foreground">
        <Link href="/giris" className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">
          Girişe dön
        </Link>
      </p>
    </form>
  );
}
