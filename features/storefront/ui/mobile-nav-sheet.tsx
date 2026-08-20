"use client";

/**
 * Header hamburger drawer — mobile only. The tab bar (`MobileBottomNav`)
 * already covers the five everyday destinations, so this menu exists for
 * what it doesn't: Düzenli Sipariş (a distinct thing from browsing the
 * catalog, not a tab), the admin panel shortcut, sign-in/out, and a phone
 * number for anyone who would rather just call.
 *
 * Closes itself on every link tap (`setOpen(false)`) rather than relying on
 * the route change to unmount it — otherwise the drawer is still visibly
 * open for a moment after tapping through, which reads as broken on a slow
 * connection. `cart-sheet.tsx`'s checkout link does the same for the same
 * reason.
 */
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRightIcon,
  HouseIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  LogOutIcon,
  MenuIcon,
  PhoneIcon,
  RepeatIcon,
  SearchIcon,
  UserRoundIcon,
} from "lucide-react";

import { customerSignOutAction } from "@/features/storefront/application/customer-auth";
import { COMPANY } from "@/features/storefront/domain/legal";
import { SUPPORT_WHATSAPP_E164 } from "@/features/storefront/domain/support-contact";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function MobileNavSheet({
  authed,
  isAdmin,
}: {
  authed: boolean;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="size-11 rounded-full sm:hidden"
            aria-label="Menü"
          />
        }
      >
        <MenuIcon className="size-6" aria-hidden />
      </SheetTrigger>

      <SheetContent side="left" className="w-4/5 gap-0 sm:max-w-xs">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle className="font-display text-lg">Menü</SheetTitle>
        </SheetHeader>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          <DrawerLink href="/" onNavigate={close} icon={<HouseIcon className="size-5" aria-hidden />}>
            Ana Sayfa
          </DrawerLink>
          <DrawerLink href="/#urunler" onNavigate={close} icon={<LayoutGridIcon className="size-5" aria-hidden />}>
            Ürünler
          </DrawerLink>
          <DrawerLink href="/duzenli-siparis" onNavigate={close} icon={<RepeatIcon className="size-5" aria-hidden />}>
            Düzenli Sipariş
          </DrawerLink>
          <DrawerLink href="/siparis-sorgula" onNavigate={close} icon={<SearchIcon className="size-5" aria-hidden />}>
            Sipariş Sorgula
          </DrawerLink>
          {isAdmin ? (
            <DrawerLink
              href="/admin"
              onNavigate={close}
              icon={<LayoutDashboardIcon className="size-5" aria-hidden />}
            >
              Yönetim Paneli
            </DrawerLink>
          ) : (
            <DrawerLink
              href={authed ? "/hesap" : "/giris"}
              onNavigate={close}
              icon={<UserRoundIcon className="size-5" aria-hidden />}
            >
              {authed ? "Hesabım" : "Giriş Yap"}
            </DrawerLink>
          )}

          {authed ? (
            <form action={customerSignOutAction} className="mt-1">
              <button
                type="submit"
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-base font-medium text-muted-foreground transition-colors active:bg-secondary/60"
              >
                <LogOutIcon className="size-5" aria-hidden />
                Çıkış Yap
              </button>
            </form>
          ) : null}
        </nav>

        <a
          href={`tel:${SUPPORT_WHATSAPP_E164}`}
          className="m-3 flex items-center gap-3 rounded-2xl bg-primary/10 p-4 transition-colors active:bg-primary/15"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <PhoneIcon className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-muted-foreground">Bizi arayın</span>
            <span className="block truncate font-display text-base font-semibold text-foreground">
              {COMPANY.phone}
            </span>
          </span>
          <ArrowRightIcon className="size-4 shrink-0 text-primary" aria-hidden />
        </a>
      </SheetContent>
    </Sheet>
  );
}

function DrawerLink({
  href,
  onNavigate,
  icon,
  children,
}: {
  href: string;
  onNavigate: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-medium text-foreground transition-colors active:bg-secondary/60"
    >
      {icon}
      {children}
    </Link>
  );
}
