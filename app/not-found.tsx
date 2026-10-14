import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { MetaPixelTracker } from "@/features/storefront/ui/meta-pixel-tracker";
import { NotFoundCard } from "@/features/storefront/ui/not-found-card";
import { isMetaPixelEnabled } from "@/shared/analytics/meta-pixel-config";

import { shopBody, shopDisplay } from "./(shop)/fonts";
import "./(shop)/theme.css";

// Without this the tab read "Apuhan Çiftliği — Admin" (the root layout's
// title) to a customer who had mistyped an address.
export const metadata: Metadata = {
  title: "Sayfa bulunamadı | Apuhan Çiftliği",
};

/**
 * Site-wide 404: any address that matches no route. Next's built-in page for
 * this is English ("This page could not be found") with no way back, which is
 * what a customer following a stale or mistyped link used to land on.
 *
 * It renders under the ROOT layout only — not the shop layout — so it brings
 * the shop's theme and typefaces itself and shows a minimal brand header in
 * place of the full one (which needs the catalogue and the viewer).
 *
 * Mounts the Meta Pixel PageView tracker itself for the same reason — a
 * customer arriving on a dead ad or shared link is still a page view (owner
 * decision 2026-10-14: every storefront page). A mistyped ADMIN address lands
 * here too; `isPageViewPath` refuses the admin segments, so those never report.
 */
export default function NotFound() {
  return (
    <div
      className={`${shopBody.variable} ${shopDisplay.variable} shop-theme flex min-h-dvh flex-col bg-background text-foreground`}
    >
      {isMetaPixelEnabled() ? <MetaPixelTracker /> : null}
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Link
            href="/"
            aria-label="Apuhan Çiftliği, ana sayfa"
            className="shop-focus flex min-h-12 items-center gap-2.5 rounded-xl"
          >
            <Image
              src="/brand/apuhan-ciftligi-logo.png"
              alt=""
              width={56}
              height={56}
              className="size-12 shrink-0 rounded-full"
            />
            <span className="font-display text-xl leading-none">Apuhan Çiftliği</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12 sm:py-16">
        <NotFoundCard />
      </main>
    </div>
  );
}
