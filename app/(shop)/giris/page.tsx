import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/features/auth/application/get-session";
import { CustomerAuthForm } from "@/features/storefront/ui/customer-auth-form";
import { safeNextPath } from "@/shared/utils/next-path";

// Account / checkout page: crawlable (so Google sees this) but never indexed.
export const metadata: Metadata = {
  title: "Giriş yap",
  robots: { index: false, follow: true },
};

export default async function CustomerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // A customer sent here from a full basket must land back on it, not on /hesap.
  const destination = safeNextPath(next);

  const user = await getCurrentUser();
  if (user) redirect(destination);

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <div className="text-center">
        <h1 className="font-display text-[2rem] leading-tight sm:text-4xl">Giriş yap</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Bilgileriniz hazır gelsin, siparişlerinizi takip edin.
        </p>
      </div>
      <CustomerAuthForm mode="signin" next={destination} />
    </main>
  );
}
