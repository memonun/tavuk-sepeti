import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/features/auth/application/get-session";
import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import { getMyAccount } from "@/features/storefront/application/get-account";
import { ensureCustomerProfile } from "@/features/storefront/application/ensure-customer-profile";
import { getStorefrontSettings } from "@/features/storefront/application/get-storefront-settings";
import { listMyRecurringTemplatesAction } from "@/features/storefront/application/recurring-order-request";
import { buildWhatsAppLink, SUPPORT_WHATSAPP_E164 } from "@/features/storefront/domain/support-contact";
import { MyRecurringOrders } from "@/features/storefront/ui/my-recurring-orders";
import { RecurringOrderForm } from "@/features/storefront/ui/recurring-order-form";

export const metadata: Metadata = {
  title: "Düzenli Sipariş — Apuhan Çiftliği",
  description:
    "Her hafta düzenli aldığınız ürünleri tekrar tekrar sipariş vermeden planlayın. Teslimat alt limiti: 250 ₺",
};

const STEPS = [
  {
    title: "Ürün seçin",
    description: "Her hafta almak istediğiniz ürünleri ve miktarları belirleyin.",
  },
  {
    title: "Sıklık belirleyin",
    description: "Haftalık veya iki haftada bir — size uygun sıklığı seçin.",
  },
  {
    title: "Onaylayalım, biz gönderelim",
    description: "Ekibimiz talebinizi onayladığında, ürünleriniz seçtiğiniz günde hazır olur.",
  },
] as const;

function Header() {
  return (
    <div>
      <h1 className="font-display text-3xl tracking-[-0.01em] text-foreground">
        🔄 Düzenli Sipariş
      </h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
        Her hafta düzenli aldığınız ürünleri tekrar tekrar sipariş vermeden
        planlayın.
      </p>
    </div>
  );
}

function StepsExplainer() {
  return (
    <ol className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {STEPS.map((step, index) => (
        <li key={step.title} className="rounded-2xl border border-border bg-card p-4">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {index + 1}
          </span>
          <p className="mt-3 font-semibold text-foreground">{step.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {step.description}
          </p>
        </li>
      ))}
    </ol>
  );
}

function SignedOutView() {
  const interestLink = buildWhatsAppLink(
    SUPPORT_WHATSAPP_E164,
    "Merhabalar, düzenli sipariş oluşturmak istiyorum.",
  );
  return (
    <div className="flex flex-col gap-10">
      <Header />
      <StepsExplainer />
      <div className="rounded-2xl border border-border bg-card p-5 text-center sm:p-6">
        <p className="text-sm font-medium text-foreground">
          Düzenli sipariş oluşturmak için giriş yapmanız gerekiyor.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Hesabınız yoksa giriş sayfasından birkaç saniyede oluşturabilirsiniz.
        </p>
        <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/giris?next=/duzenli-siparis"
            className={cn(buttonVariants({ size: "lg" }), "rounded-full")}
          >
            Giriş yap
          </Link>
          <a
            href={interestLink}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ size: "lg", variant: "outline" }), "rounded-full")}
          >
            WhatsApp&apos;tan sorun
          </a>
        </div>
      </div>
    </div>
  );
}

function NeedsAddressView() {
  return (
    <div className="flex flex-col gap-10">
      <Header />
      <StepsExplainer />
      <div className="rounded-2xl border border-border bg-card p-5 text-center sm:p-6">
        <p className="text-sm font-medium text-foreground">
          Önce hesabınıza bir teslimat adresi ekleyin.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Düzenli siparişiniz bu adrese göre planlanacak.
        </p>
        <Link
          href="/hesap"
          className={cn(buttonVariants({ size: "lg" }), "mt-4 rounded-full")}
        >
          Adres ekle
        </Link>
      </div>
    </div>
  );
}

export default async function RecurringOrderPage() {
  const content = await (async () => {
    const user = await getCurrentUser();
    if (!user) return <SignedOutView />;

    await ensureCustomerProfile();
    const account = await getMyAccount();
    const hasPrimaryAddress = account?.addresses.some((a) => a.is_primary) ?? false;
    if (!hasPrimaryAddress) return <NeedsAddressView />;

    const [catalog, settings, templates] = await Promise.all([
      getStorefrontCatalog(),
      getStorefrontSettings(),
      listMyRecurringTemplatesAction(),
    ]);
    const products = catalog.ok ? catalog.value : [];

    return (
      <div className="flex flex-col gap-8">
        <Header />
        <MyRecurringOrders templates={templates} />
        <RecurringOrderForm products={products} homeDeliveryDays={settings.homeDeliveryDays} />
      </div>
    );
  })();

  return (
    <main className="mx-auto max-w-2xl px-4 pt-8 pb-24 sm:px-6">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
        Ana Sayfa
      </Link>
      {content}
    </main>
  );
}
