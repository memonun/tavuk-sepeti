"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  customerSignInAction,
  customerSignUpAction,
  type CustomerAuthState,
} from "@/features/storefront/application/customer-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: CustomerAuthState = { status: "idle" };

/** Shared sign-in / sign-up form (email + password). */
export function CustomerAuthForm({
  mode,
  /** Where to land after success. Carried through signup's confirmation mail
   *  too, so "log in to finish your order" returns to the basket. */
  next,
}: {
  mode: "signin" | "signup";
  next?: string | undefined;
}) {
  const action =
    mode === "signin" ? customerSignInAction : customerSignUpAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const withNext = (path: string): string =>
    next ? `${path}?next=${encodeURIComponent(next)}` : path;

  if (state.status === "email_taken") {
    return (
      <div className="rounded-3xl border border-border/70 bg-card p-6 text-center shadow-sm">
        <h2 className="font-display text-xl">Bu e-posta zaten kayıtlı</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          <strong>{state.email}</strong> için bir hesabınız var. Şifrenizle giriş
          yapabilirsiniz.
        </p>
        <Link
          href={withNext("/giris")}
          className="mt-4 inline-block text-primary hover:underline"
        >
          Giriş yap
        </Link>
        <p className="mt-2 text-xs text-muted-foreground">
          <Link href="/sifremi-unuttum" className="hover:underline">
            Şifrenizi mi unuttunuz?
          </Link>
        </p>
      </div>
    );
  }

  if (state.status === "verify_email") {
    return (
      <div className="rounded-3xl border border-border/70 bg-card p-6 text-center shadow-sm">
        <h2 className="font-display text-xl">E-postanızı doğrulayın</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          <strong>{state.email}</strong> adresine bir doğrulama bağlantısı
          gönderdik. Hesabınızı etkinleştirmek için e-postadaki bağlantıya
          tıklayın.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {mode === "signup" ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="first_name">Ad</Label>
            <Input
              id="first_name"
              name="first_name"
              autoComplete="given-name"
              required
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="last_name">Soyad</Label>
            <Input
              id="last_name"
              name="last_name"
              autoComplete="family-name"
              required
              disabled={pending}
            />
          </div>
        </div>
      ) : null}

      {mode === "signup" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Telefon</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0532 123 45 67"
            required
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">
            Teslimat sırasında size ulaşabilmemiz için gerekli.
          </p>
        </div>
      ) : null}

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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Şifre</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
          disabled={pending}
          {...(mode === "signup" ? { minLength: 8 } : {})}
        />
        {mode === "signup" ? (
          <p className="text-xs text-muted-foreground">En az 8 karakter.</p>
        ) : null}
      </div>

      {mode === "signin" ? (
        <div className="-mt-2 text-right">
          <Link
            href="/sifremi-unuttum"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Şifremi unuttum?
          </Link>
        </div>
      ) : null}

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
        {pending
          ? "Lütfen bekleyin…"
          : mode === "signin"
            ? "Giriş yap"
            : "Hesap oluştur"}
      </Button>

      {mode === "signup" ? (
        <p className="text-center text-xs text-muted-foreground">
          Hesap bilgilerinizin nasıl işlendiğine ilişkin ayrıntılar için{" "}
          <Link
            href="/gizlilik-politikasi"
            className="underline underline-offset-2"
            target="_blank"
          >
            Gizlilik Politikamızı
          </Link>{" "}
          inceleyebilirsiniz.
        </p>
      ) : null}

      <p className="text-center text-sm text-muted-foreground">
        {mode === "signin" ? (
          <>
            Hesabınız yok mu?{" "}
            <Link href={withNext("/kayit")} className="text-primary hover:underline">
              Kayıt olun
            </Link>
          </>
        ) : (
          <>
            Zaten hesabınız var mı?{" "}
            <Link href={withNext("/giris")} className="text-primary hover:underline">
              Giriş yapın
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
