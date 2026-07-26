import { PasswordResetRequestForm } from "@/features/storefront/ui/password-reset-request-form";

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <div className="text-center">
        <h1 className="font-display text-3xl">Şifremi unuttum</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          E-posta adresinize bir sıfırlama bağlantısı gönderelim.
        </p>
      </div>
      <PasswordResetRequestForm />
    </main>
  );
}
