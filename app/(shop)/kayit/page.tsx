import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/features/auth/application/get-session";
import { CustomerAuthForm } from "@/features/storefront/ui/customer-auth-form";
import { safeNextPath } from "@/shared/utils/next-path";

export const metadata: Metadata = { title: "Hesap oluştur" };

export default async function CustomerSignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = safeNextPath(next);

  const user = await getCurrentUser();
  if (user) redirect(destination);

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <div className="text-center">
        <h1 className="font-display text-[2rem] leading-tight sm:text-4xl">Hesap oluştur</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Hızlı sipariş ve teslimat takibi için ücretsiz hesap.
        </p>
      </div>
      <CustomerAuthForm mode="signup" next={destination} />
    </main>
  );
}
