import type { Metadata } from "next";

import { buildPageMetadata } from "@/features/storefront/application/page-metadata";
import { FindOrderForm } from "@/features/storefront/ui/find-order-form";

export const metadata: Metadata = buildPageMetadata({
  title: "Sipariş sorgula",
  description:
    "Sipariş numaranız ve telefonunuzla siparişinizin durumunu görün, ödemesini tamamlayın.",
  canonical: "/siparis-sorgula",
});

export default function FindOrderPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <div className="text-center">
        <h1 className="font-display text-[2rem] leading-tight sm:text-4xl">Sipariş sorgula</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Hesabınız olmadan verdiğiniz siparişin durumunu buradan görebilir,
          ödemesi yarım kaldıysa tamamlayabilirsiniz. Hesabınız varsa
          siparişleriniz &quot;Hesabım&quot; sayfasında da listelenir.
        </p>
      </div>
      <FindOrderForm />
    </main>
  );
}
