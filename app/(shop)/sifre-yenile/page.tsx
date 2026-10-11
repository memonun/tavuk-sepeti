import Link from "next/link";

import { getCurrentUser } from "@/features/auth/application/get-session";
import { PasswordUpdateForm } from "@/features/storefront/ui/password-update-form";

/**
 * Set-new-password page. Reached via the recovery link, which lands on
 * /auth/confirm and establishes a recovery session before forwarding
 * here. Without that session (link expired or opened directly) we show a
 * recovery prompt instead of the form.
 */
export default async function ResetPasswordPage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <div className="text-center">
        <h1 className="font-display text-[2rem] leading-tight sm:text-4xl">Yeni şifre belirle</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Hesabınız için yeni bir şifre girin.
        </p>
      </div>

      {user ? (
        <PasswordUpdateForm />
      ) : (
        <div className="rounded-3xl border border-border bg-card p-6 text-center shadow-(--shop-shadow-sm)">
          <p className="text-base text-muted-foreground">
            Bağlantı geçersiz veya süresi dolmuş olabilir. Lütfen yeni bir
            sıfırlama isteği gönderin.
          </p>
          <Link
            href="/sifremi-unuttum"
            className="inline-flex min-h-11 items-center mt-4 inline-block text-base text-primary underline underline-offset-4"
          >
            Yeni bağlantı iste
          </Link>
        </div>
      )}
    </main>
  );
}
