"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import {
  customerSignInAction,
  customerSignUpAction,
  type CustomerAuthState,
} from "@/features/storefront/application/customer-auth";
import { ShopButton } from "@/features/storefront/ui/kit/shop-button";
import { ShopInput } from "@/features/storefront/ui/kit/shop-field";
import { trackCompleteRegistration } from "@/shared/analytics/meta-pixel";

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
  // React resets every uncontrolled field in a `action={fn}` form once the
  // action settles — including on a failed submission, not just a successful
  // one. That silently wiped the e-mail field on a wrong password, forcing a
  // retype for no reason. A controlled value survives it: React re-applies
  // this state to the input on the very next render regardless of what the
  // native reset just did to the DOM.
  const [email, setEmail] = useState("");
  const withNext = (path: string): string =>
    next ? `${path}?next=${encodeURIComponent(next)}` : path;

  // Meta Pixel CompleteRegistration: signup answers `verify_email` only once
  // the account exists (an existing e-mail answers `email_taken` instead).
  useEffect(() => {
    if (mode === "signup" && state.status === "verify_email") {
      trackCompleteRegistration({ where: "kayit" });
    }
  }, [mode, state]);

  if (state.status === "email_taken") {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 text-center shadow-(--shop-shadow-sm)">
        <h2 className="font-display text-2xl leading-tight">Bu e-posta zaten kayıtlı</h2>
        <p className="mt-2 text-base text-muted-foreground">
          <strong>{state.email}</strong> için bir hesabınız var. Şifrenizle giriş
          yapabilirsiniz.
        </p>
        <Link
          href={withNext("/giris")}
          className="mt-4 inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-4"
        >
          Giriş yap
        </Link>
        <p className="mt-2 text-base text-muted-foreground">
          <Link href="/sifremi-unuttum" className="inline-flex min-h-11 items-center underline underline-offset-4">
            Şifrenizi mi unuttunuz?
          </Link>
        </p>
      </div>
    );
  }

  if (state.status === "verify_email") {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 text-center shadow-(--shop-shadow-sm)">
        <h2 className="font-display text-2xl leading-tight">E-postanızı doğrulayın</h2>
        <p className="mt-2 text-base text-muted-foreground">
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
          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-base font-bold text-foreground" htmlFor="first_name">Ad</label>
            <ShopInput
              id="first_name"
              name="first_name"
              autoComplete="given-name"
              required
              disabled={pending}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-base font-bold text-foreground" htmlFor="last_name">Soyad</label>
            <ShopInput
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
        <div className="flex min-w-0 flex-col gap-2">
          <label className="text-base font-bold text-foreground" htmlFor="phone">Telefon</label>
          <ShopInput
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0532 123 45 67"
            required
            disabled={pending}
          />
          <p className="text-base text-muted-foreground">
            Teslimat sırasında size ulaşabilmemiz için gerekli.
          </p>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col gap-2">
        <label className="text-base font-bold text-foreground" htmlFor="email">E-posta</label>
        <ShopInput
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <label className="text-base font-bold text-foreground" htmlFor="password">Şifre</label>
        <ShopInput
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
          disabled={pending}
          {...(mode === "signup" ? { minLength: 8 } : {})}
        />
        {mode === "signup" ? (
          <p className="text-base text-muted-foreground">En az 8 karakter.</p>
        ) : null}
      </div>

      {mode === "signin" ? (
        <div className="-mt-2 text-right">
          <Link
            href="/sifremi-unuttum"
            className="inline-flex min-h-11 items-center text-base font-bold text-foreground underline underline-offset-4"
          >
            Şifremi unuttum?
          </Link>
        </div>
      ) : null}

      {state.status === "error" ? (
        <p className="text-base text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}

      <ShopButton
        type="submit" size="lg" block
        disabled={pending}
      >
        {pending
          ? "Lütfen bekleyin…"
          : mode === "signin"
            ? "Giriş yap"
            : "Hesap oluştur"}
      </ShopButton>

      {mode === "signup" ? (
        <p className="text-center text-base text-muted-foreground">
          Hesap bilgilerinizin nasıl işlendiğine ilişkin ayrıntılar için{" "}
          <Link
            href="/gizlilik-politikasi"
            className="inline-flex min-h-11 items-center underline underline-offset-4"
            target="_blank"
          >
            Gizlilik Politikamızı
          </Link>{" "}
          inceleyebilirsiniz.
        </p>
      ) : null}

      <p className="text-center text-base text-muted-foreground">
        {mode === "signin" ? (
          <>
            Hesabınız yok mu?{" "}
            <Link href={withNext("/kayit")} className="inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-4">
              Kayıt olun
            </Link>
          </>
        ) : (
          <>
            Zaten hesabınız var mı?{" "}
            <Link href={withNext("/giris")} className="inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-4">
              Giriş yapın
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
