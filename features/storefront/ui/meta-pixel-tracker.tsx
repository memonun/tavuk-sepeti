"use client";

/**
 * Reports a Meta Pixel PageView on every client-side route change of the
 * public storefront. Renders nothing.
 *
 * Only mounted by app/(shop)/layout.tsx when a Pixel ID is configured (see
 * shared/analytics/meta-pixel-config.ts), and the admin panel is outside that
 * layout — so with no ID this component does not exist, and admin pages never
 * report to Meta. Every storefront page reports (owner decision 2026-10-14);
 * duplicate handling and the credential-in-URL check live in `trackPageView`.
 */
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { trackPageView } from "@/shared/analytics/meta-pixel";

export function MetaPixelTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) trackPageView(pathname);
  }, [pathname]);

  return null;
}
