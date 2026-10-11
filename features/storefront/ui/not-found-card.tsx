import { SearchXIcon } from "lucide-react";

import { ShopLinkButton } from "@/features/storefront/ui/kit/shop-button";

/**
 * "This page does not exist", in the shop's own voice. Used twice: inside the
 * shop layout (app/(shop)/not-found.tsx, for a `notFound()` thrown by a shop
 * page) and by the site-wide 404 (app/not-found.tsx, for an address that
 * matches no route at all).
 */
export function NotFoundCard() {
  return (
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
  );
}
