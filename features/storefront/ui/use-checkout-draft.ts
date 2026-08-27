"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PaymentMethod } from "@/features/storefront/domain/payment-options";
import type { CollectedAddress } from "@/features/storefront/ui/address-form";

/**
 * The parts of checkout the customer types in, mirrored to sessionStorage so the
 * form stops forgetting them.
 *
 * Three things used to blank these fields:
 *   - a failed order submit — React 19 resets an uncontrolled `<form action>`
 *     once its action resolves, so the guest contact block wiped on every error
 *     (the account block already worked around this by echoing values back);
 *   - switching the payment method / any other re-render that remounts a field;
 *   - the card path leaving the site for PayTR and coming back to a fresh page.
 *
 * sessionStorage, not localStorage: this is PII (name, phone, e-mail, home
 * address). It has to outlive a page load in THIS tab — not sit on a shared
 * machine for the next visitor. The cart (no PII) stays in localStorage; this
 * does not. Cleared outright once the order is actually placed.
 *
 * Read synchronously in a lazy initializer (never during the server render —
 * `readDraft` guards on `window`), so the values are present on the first client
 * render and there is no empty-then-filled flicker and no hydrate-after-mount
 * race to guard against.
 */
export interface CheckoutDraft {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  deliveryNotes: string;
  paymentMethod: PaymentMethod | "";
  /** A guest's collected+confirmed delivery address (no address book to save it
   *  to before the order exists). Null for account customers, who pick from the
   *  saved book instead. */
  guestAddress: CollectedAddress | null;
}

const EMPTY_DRAFT: CheckoutDraft = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  deliveryNotes: "",
  paymentMethod: "",
  guestAddress: null,
};

const STORAGE_KEY = "ts_checkout_draft_v1";

function readDraft(): CheckoutDraft {
  if (typeof window === "undefined") return EMPTY_DRAFT;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as Partial<CheckoutDraft>;
    // Spread over the defaults so a payload written by an older shape (missing
    // keys) still yields a fully-formed draft.
    return { ...EMPTY_DRAFT, ...parsed };
  } catch {
    return EMPTY_DRAFT;
  }
}

/** Fire-and-forget wipe for callers outside React (the payment-success page). */
export function clearCheckoutDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // private mode / disabled storage — nothing persisted anyway
  }
}

export interface CheckoutDraftApi {
  draft: CheckoutDraft;
  /** Shallow-merge a subset of fields. */
  patch: (next: Partial<CheckoutDraft>) => void;
  /** Reset to empty and drop the stored copy — call once the order is placed. */
  clearDraft: () => void;
}

export function useCheckoutDraft(): CheckoutDraftApi {
  const [draft, setDraft] = useState<CheckoutDraft>(readDraft);

  // Mirror every change back to sessionStorage. `skipFirst` avoids a redundant
  // write of the value we just read in on mount.
  const skipFirst = useRef(true);
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // quota / private mode — the in-memory draft still covers this session
    }
  }, [draft]);

  const patch = useCallback(
    (next: Partial<CheckoutDraft>) => setDraft((d) => ({ ...d, ...next })),
    [],
  );

  const clearDraft = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    clearCheckoutDraft();
  }, []);

  return { draft, patch, clearDraft };
}
