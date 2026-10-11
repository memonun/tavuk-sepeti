"use client";

import { useActionState } from "react";

import {
  updatePasswordAction,
  type PasswordUpdateState,
} from "@/features/storefront/application/customer-auth";
import { ShopButton } from "@/features/storefront/ui/kit/shop-button";
import { ShopInput } from "@/features/storefront/ui/kit/shop-field";

const initialState: PasswordUpdateState = { status: "idle" };

/** Set a new password (from the recovery-link session). */
export function PasswordUpdateForm() {
  const [state, formAction, pending] = useActionState(
    updatePasswordAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        <label className="text-base font-bold text-foreground" htmlFor="password">Yeni şifre</label>
        <ShopInput
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={pending}
        />
        <p className="text-base text-muted-foreground">En az 8 karakter.</p>
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
        {pending ? "Kaydediliyor…" : "Şifreyi güncelle"}
      </ShopButton>
    </form>
  );
}
