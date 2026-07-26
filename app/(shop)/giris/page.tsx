import { redirect } from "next/navigation";

import { getCurrentUser } from "@/features/auth/application/get-session";
import { CustomerAuthForm } from "@/features/storefront/ui/customer-auth-form";

export default async function CustomerLoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/hesap");

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <div className="text-center">
        <h1 className="font-display text-3xl">Giriş yap</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bilgileriniz hazır gelsin, siparişlerinizi takip edin.
        </p>
      </div>
      <CustomerAuthForm mode="signin" />
    </main>
  );
}
