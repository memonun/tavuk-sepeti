"use client";

import Link from "next/link";
import { LayoutDashboardIcon, UserRoundIcon } from "lucide-react";

import { customerSignOutAction } from "@/features/storefront/application/customer-auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Header auth control:
 *   - admin  → "Yönetim" button (→ /admin) + logout, so admins reach the
 *     dashboard by a click, never by typing the URL.
 *   - customer → "Hesabım" + logout.
 *   - signed out → "Giriş".
 */
export function AccountNav({
  authed,
  isAdmin,
}: {
  authed: boolean;
  isAdmin: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {isAdmin ? (
        <Link
          href="/admin"
          className={cn(
            buttonVariants({ variant: "default", size: "lg" }),
            "rounded-full",
          )}
        >
          <LayoutDashboardIcon />
          <span className="hidden sm:inline">Yönetim</span>
        </Link>
      ) : null}

      {!authed ? (
        <Link
          href="/giris"
          className={cn(
            buttonVariants({ variant: "ghost", size: "lg" }),
            "rounded-full",
          )}
        >
          <UserRoundIcon />
          <span className="hidden sm:inline">Giriş</span>
        </Link>
      ) : (
        <>
          {!isAdmin ? (
            <Link
              href="/hesap"
              className={cn(
                buttonVariants({ variant: "ghost", size: "lg" }),
                "rounded-full",
              )}
            >
              <UserRoundIcon />
              <span className="hidden sm:inline">Hesabım</span>
            </Link>
          ) : null}
          <form action={customerSignOutAction}>
            <Button
              type="submit"
              variant="ghost"
              size="lg"
              className="rounded-full text-muted-foreground"
            >
              Çıkış
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
