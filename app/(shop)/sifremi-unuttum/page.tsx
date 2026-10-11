import type { Metadata } from "next";
import { PasswordResetRequestForm } from "@/features/storefront/ui/password-reset-request-form";

export const metadata: Metadata = { title: "Şifremi unuttum" };

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <div className="text-center">
        <h1 className="font-display text-[2rem] leading-tight sm:text-4xl">Şifremi unuttum</h1>
        <p className="mt-1 text-base text-muted-foreground">
          E-posta adresinize bir sıfırlama bağlantısı gönderelim.
        </p>
      </div>
      <PasswordResetRequestForm />
    </main>
  );
}
