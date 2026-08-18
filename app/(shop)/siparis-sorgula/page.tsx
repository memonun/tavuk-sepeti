import type { Metadata } from "next";

import { FindOrderForm } from "@/features/storefront/ui/find-order-form";

export const metadata: Metadata = {
  title: "Sipariş sorgula — Apuhan Çiftliği",
  description:
    "Sipariş numaranız ve telefonunuzla siparişinizin durumunu görün, ödemesini tamamlayın.",
};

export default function FindOrderPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <div className="text-center">
        <h1 className="font-display text-3xl">Sipariş sorgula</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hesabınız varsa yukarıdan &quot;Hesabım&quot; tuşuna basarak aktif
          siparişlerinizi takip edebilirsiniz. Hesabınız
          olmadan verdiğiniz siparişlerin durumunu da buradan görebilir, ödemesi
          yarım kaldıysa tamamlayabilirsiniz.
        </p>
      </div>
      <FindOrderForm />
    </main>
  );
}
