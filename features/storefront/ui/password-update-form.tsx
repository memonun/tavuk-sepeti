"use client";

import { useActionState } from "react";

import {
  updatePasswordAction,
  type PasswordUpdateState,
} from "@/features/storefront/application/customer-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: PasswordUpdateState = { status: "idle" };

/** Set a new password (from the recovery-link session). */
export function PasswordUpdateForm() {
  const [state, formAction, pending] = useActionState(
    updatePasswordAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Yeni şifre</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">En az 8 karakter.</p>
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
        {pending ? "Kaydediliyor…" : "Şifreyi güncelle"}
      </Button>
    </form>
  );
}
