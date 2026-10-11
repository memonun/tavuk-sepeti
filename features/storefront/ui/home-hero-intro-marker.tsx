"use client";

import { useEffect } from "react";

import {
  HOME_INTRO_SEEN_ATTR,
  HOME_INTRO_STORAGE_KEY,
} from "@/features/storefront/ui/home-hero-intro";

/**
 * Renders nothing. Once the home page's opening picture has been shown, this
 * records it — in sessionStorage for the next full page load (read by the
 * inline script in `HomeHero`), and on <html> for the rest of this page's
 * life, because a client-side navigation back to the home page remounts the
 * picture without running that script again.
 *
 * Setting the attribute while the entrance is still running does not cut it
 * short: it only switches off the starting style, which has already been
 * applied.
 */
export function HomeHeroIntroMarker() {
  useEffect(() => {
    document.documentElement.setAttribute(HOME_INTRO_SEEN_ATTR, "");
    try {
      window.sessionStorage.setItem(HOME_INTRO_STORAGE_KEY, "1");
    } catch {
      // Storage unavailable (blocked site data, some private modes): the
      // opening simply plays again on the next full load. Same tolerance as
      // the basket's own storage writes in cart-provider.tsx.
    }
  }, []);

  return null;
}
