import { SearchXIcon } from "lucide-react";

import { ShopLinkButton } from "@/features/storefront/ui/kit/shop-button";

/**
 * Storefront 404. Without it a missing page (a mistyped legal link, an old
 * bookmark) fell through to Next's built-in English "This page could not be
 * found" — no header, no way back. This one renders inside the shop layout,
 * so the header, the tab bar and the basket are all still there.
 */
export default function ShopNotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-12 sm:py-16">
      <div className="flex flex-col items-center gap-5 rounded-3xl border border-border bg-card p-6 text-center shadow-(--shop-shadow-sm) sm:p-8">
        <SearchXIcon className="size-14 text-muted-foreground" aria-hidden />
        <h1 className="font-display text-3xl leading-tight">Bu sayfayı bulamadık</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          Aradığınız sayfa taşınmış ya da kaldırılmış olabilir. Sepetiniz
          duruyor.
        </p>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <ShopLinkButton href="/" size="lg">
            Ana sayfaya dön
          </ShopLinkButton>
          <ShopLinkButton href="/siparis-sorgula" size="lg" variant="secondary">
            Siparişimi sorgula
          </ShopLinkButton>
        </div>
      </div>
    </main>
  );
}
