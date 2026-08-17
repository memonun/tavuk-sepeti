"use client";

/**
 * The only client-side piece of the delivery-scope picker, and it renders
 * nothing — its whole job is remembering the customer's last choice across
 * visits without ever gating the server-rendered page on it (that would risk
 * an SSR/client hydration mismatch). Search params stay the actual source of
 * truth for what's on screen; this just keeps `localStorage` and the URL in
 * sync on mount:
 *   - a `?teslimat=` on the current URL is saved as the new remembered value.
 *   - a bare `/` with a remembered value redirects (replace, not push — no
 *     extra history entry, and never something the back button depends on)
 *     to bring that scope back, without jumping the page down to the catalog.
 */
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  DELIVERY_SCOPE_STORAGE_KEY,
  parseDeliveryScope,
} from "@/features/storefront/domain/catalog-filter";

export function StorefrontScopeSync() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = parseDeliveryScope(searchParams.get("teslimat") ?? undefined);

  useEffect(() => {
    if (current) {
      window.localStorage.setItem(DELIVERY_SCOPE_STORAGE_KEY, current);
      return;
    }

    const stored = parseDeliveryScope(
      window.localStorage.getItem(DELIVERY_SCOPE_STORAGE_KEY) ?? undefined,
    );
    if (!stored) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("teslimat", stored);
    router.replace(`/?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  return null;
}
