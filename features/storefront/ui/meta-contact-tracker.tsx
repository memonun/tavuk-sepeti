"use client";

/**
 * Reports Meta Pixel Contact whenever a customer taps a WhatsApp (wa.me) or
 * phone (tel:) link anywhere on the storefront. Renders nothing; mounted by
 * app/(shop)/layout.tsx only when a Pixel ID is set.
 *
 * One delegated listener instead of an onClick on every link: most of those
 * links live in Server Components (the floating WhatsApp button, the
 * "Telefonla da sipariş verebilirsiniz" card, the havale receipt link), and a
 * contact link added later is covered without anyone remembering to wire it.
 * Capture phase, so the event is recorded before the browser leaves for
 * WhatsApp or the dialer. Only the channel is sent — never the number.
 */
import { useEffect } from "react";

import { contactChannelOf, trackContact } from "@/shared/analytics/meta-pixel";

export function MetaContactTracker() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      try {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const link = target.closest("a[href]");
        const href = link?.getAttribute("href");
        if (!href) return;
        const channel = contactChannelOf(href);
        if (channel) trackContact({ channel });
      } catch {
        // Analytics must never affect the shop.
      }
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
