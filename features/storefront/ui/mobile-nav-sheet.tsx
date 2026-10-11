"use client";

/**
 * Header menu drawer — phone and tablet (the desktop header shows the same
 * links inline). The tab bar (`MobileBottomNav`)
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
  ChevronRightIcon,
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
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { ShopButton } from "@/features/storefront/ui/kit/shop-button";
import { shopSheetClass } from "@/features/storefront/ui/kit/shop-sheet";

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
        render={<ShopButton variant="quiet" className="lg:hidden" />}
      >
        <MenuIcon aria-hidden />
        Menü
      </SheetTrigger>

      {/* Opens from the right because its button sits on the right — a panel
          should arrive from, and leave toward, the control that summoned it. */}
      <SheetContent
        side="right"
        showCloseButton={false}
        className={shopSheetClass("data-[side=right]:w-[88%]")}
      >
        <SheetHeader className="flex-row items-center justify-between border-b border-border px-4 py-3">
          <SheetTitle className="font-display text-2xl">Menü</SheetTitle>
          <SheetClose render={<ShopButton variant="quiet" />}>Kapat</SheetClose>
        </SheetHeader>

        <nav
          aria-label="Menü"
          className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-3"
        >
          <DrawerLink href="/" onNavigate={close} icon={<HouseIcon aria-hidden />}>
            Ana Sayfa
          </DrawerLink>
          <DrawerLink href="/#urunler" onNavigate={close} icon={<LayoutGridIcon aria-hidden />}>
            Ürünler
          </DrawerLink>
          <DrawerLink href="/duzenli-siparis" onNavigate={close} icon={<RepeatIcon aria-hidden />}>
            Düzenli Sipariş
          </DrawerLink>
          <DrawerLink href="/siparis-sorgula" onNavigate={close} icon={<SearchIcon aria-hidden />}>
            Sipariş Sorgula
          </DrawerLink>
          {isAdmin ? (
            <DrawerLink
              href="/admin"
              onNavigate={close}
              icon={<LayoutDashboardIcon aria-hidden />}
            >
              Yönetim Paneli
            </DrawerLink>
          ) : (
            <DrawerLink
              href={authed ? "/hesap" : "/giris"}
              onNavigate={close}
              icon={<UserRoundIcon aria-hidden />}
            >
              {authed ? "Hesabım" : "Giriş Yap"}
            </DrawerLink>
          )}

          {authed ? (
            <form action={customerSignOutAction} className="mt-1">
              <button type="submit" className={`${rowClass} w-full text-muted-foreground`}>
                <LogOutIcon className="size-6 shrink-0" aria-hidden />
                Çıkış Yap
              </button>
            </form>
          ) : null}
        </nav>

        <a
          href={`tel:${SUPPORT_WHATSAPP_E164}`}
          className="shop-press shop-focus m-3 mb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] flex items-center gap-3 rounded-2xl bg-(--shop-green-soft) p-4"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <PhoneIcon className="size-6" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base text-muted-foreground">Bizi arayın</span>
            <span className="shop-money block truncate text-xl font-bold text-foreground">
              {COMPANY.phone}
            </span>
          </span>
        </a>
      </SheetContent>
    </Sheet>
  );
}

const rowClass =
  "shop-press shop-focus flex min-h-14 items-center gap-3.5 rounded-xl px-3 text-lg font-semibold text-foreground active:bg-secondary";

function DrawerLink({
  href,
  onNavigate,
  icon,
  children,
}: {
  href: string;
  onNavigate: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} onClick={onNavigate} className={rowClass}>
      <span className="text-primary [&_svg]:size-6">{icon}</span>
      <span className="flex-1">{children}</span>
      <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
