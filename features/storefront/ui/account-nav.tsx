"use client";

import Link from "next/link";
import { UserRoundIcon } from "lucide-react";

import { customerSignOutAction } from "@/features/storefront/application/customer-auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Header auth control: "Giriş" when signed out, account link + logout when in. */
export function AccountNav({ authed }: { authed: boolean }) {
  if (!authed) {
    return (
      <Link
        href="/magaza/giris"
        className={cn(
          buttonVariants({ variant: "ghost", size: "lg" }),
          "rounded-full",
        )}
      >
        <UserRoundIcon />
        <span className="hidden sm:inline">Giriş</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      <Link
        href="/magaza/hesap"
        className={cn(
          buttonVariants({ variant: "ghost", size: "lg" }),
          "rounded-full",
        )}
      >
        <UserRoundIcon />
        <span className="hidden sm:inline">Hesabım</span>
      </Link>
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
    </div>
  );
}
