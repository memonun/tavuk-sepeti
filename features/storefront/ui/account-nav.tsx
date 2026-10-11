"use client";

import { LayoutDashboardIcon } from "lucide-react";

import { customerSignOutAction } from "@/features/storefront/application/customer-auth";
import { ShopButton, ShopLinkButton } from "@/features/storefront/ui/kit/shop-button";

/**
 * Header auth control (desktop):
 *   - admin  → "Yönetim" button (→ /admin) + logout, so admins reach the
 *     dashboard by a click, never by typing the URL.
 *   - customer → "Hesabım" + logout.
 *   - signed out → "Giriş Yap".
 */
export function AccountNav({
  authed,
  isAdmin,
}: {
  authed: boolean;
  isAdmin: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {isAdmin ? (
        <ShopLinkButton href="/admin" variant="secondary">
          <LayoutDashboardIcon aria-hidden />
          Yönetim
        </ShopLinkButton>
      ) : null}

      {!authed ? (
        <ShopLinkButton href="/giris" variant="plain">
          Giriş Yap
        </ShopLinkButton>
      ) : (
        <>
          {!isAdmin ? (
            <ShopLinkButton href="/hesap" variant="plain">
              Hesabım
            </ShopLinkButton>
          ) : null}
          <form action={customerSignOutAction}>
            <ShopButton type="submit" variant="plain" className="text-muted-foreground">
              Çıkış
            </ShopButton>
          </form>
        </>
      )}
    </div>
  );
}
