"use client";

import { useActionState } from "react";

import { signInAction, type SignInState } from "@/features/auth/application/sign-in";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: SignInState = { status: "idle" };

export function LoginForm() {
  // useActionState wires a Server Action to a form. Pending lights up while
  // the action is in flight; state carries any returned error.
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-2">
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Şifre</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
        />
      </div>

      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Giriliyor…" : "Giriş Yap"}
      </Button>
    </form>
  );
}
