"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  requestPasswordResetAction,
  type PasswordResetRequestState,
} from "@/features/storefront/application/customer-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: PasswordResetRequestState = { status: "idle" };

/** "Forgot password" request form — emails a reset link. */
export function PasswordResetRequestForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    initialState,
  );

  if (state.status === "sent") {
    return (
      <div className="rounded-3xl border border-border/70 bg-card p-6 text-center shadow-sm">
        <h2 className="font-display text-xl">Bağlantı gönderildi</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Bu e-posta kayıtlıysa, şifre sıfırlama bağlantısı gönderdik. Gelen
          kutunuzu (ve spam klasörünü) kontrol edin.
        </p>
        <Link
          href="/giris"
          className="mt-4 inline-block text-sm text-primary hover:underline"
        >
          Girişe dön
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">E-posta</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
        />
      </div>

      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="w-full rounded-full"
        disabled={pending}
      >
        {pending ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/giris" className="text-primary hover:underline">
          Girişe dön
        </Link>
      </p>
    </form>
  );
}
