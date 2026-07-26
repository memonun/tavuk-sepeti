import Link from "next/link";

import { getCurrentUser } from "@/features/auth/application/get-session";
import { PasswordUpdateForm } from "@/features/storefront/ui/password-update-form";

/**
 * Set-new-password page. Reached via the recovery link, which lands on
 * /magaza/auth/confirm and establishes a recovery session before forwarding
 * here. Without that session (link expired or opened directly) we show a
 * recovery prompt instead of the form.
 */
export default async function ResetPasswordPage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <div className="text-center">
        <h1 className="font-display text-3xl">Yeni şifre belirle</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hesabınız için yeni bir şifre girin.
        </p>
      </div>

      {user ? (
        <PasswordUpdateForm />
      ) : (
        <div className="rounded-3xl border border-border/70 bg-card p-6 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">
            Bağlantı geçersiz veya süresi dolmuş olabilir. Lütfen yeni bir
            sıfırlama isteği gönderin.
          </p>
          <Link
            href="/magaza/sifremi-unuttum"
            className="mt-4 inline-block text-sm text-primary hover:underline"
          >
            Yeni bağlantı iste
          </Link>
        </div>
      )}
    </main>
  );
}
