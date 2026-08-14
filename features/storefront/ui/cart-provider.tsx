"use client";

/**
 * Client cart state for the guest storefront (no account).
 *
 * Backed by a tiny localStorage-persisted module store read through
 * `useSyncExternalStore` — the SSR-safe way to read an external store: it
 * renders empty on the server + during hydration (no mismatch), then reconciles
 * to the persisted basket. No load-on-mount effect.
 *
 * Source of truth is only { product_key, quantity } per line; product details +
 * prices are always resolved live from the catalog (never persisted stale) and
 * re-priced server-side at checkout.
 */
import { useCallback, useSyncExternalStore } from "react";

import type { CartLine } from "@/features/storefront/domain/cart";

const STORAGE_KEY = "ts_cart_v1";
const EMPTY: readonly CartLine[] = [];

let lines: readonly CartLine[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function isCartLine(value: unknown): value is CartLine {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { product_key?: unknown }).product_key === "string" &&
    typeof (value as { quantity?: unknown }).quantity === "number" &&
    (value as { quantity: number }).quantity > 0
  );
}

function readStorage(): readonly CartLine[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isCartLine) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function ensureLoaded(): void {
  if (loaded || typeof window === "undefined") return;
  lines = readStorage();
  loaded = true;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function write(next: readonly CartLine[]): void {
  lines = next;
  loaded = true;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage full / disabled — the in-memory cart still works this session.
    }
  }
  emit();
}

// Cross-tab sync: mirror another tab's basket edits. Registered once, client-only.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      lines = readStorage();
      emit();
    }
  });
}

function subscribe(listener: () => void): () => void {
  ensureLoaded();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): readonly CartLine[] {
  ensureLoaded();
  return lines;
}

function getServerSnapshot(): readonly CartLine[] {
  return EMPTY;
}

// ---- Mutators (stable module functions) -------------------------------------

function addLine(productKey: string, quantity: number): void {
  const existing = lines.find((l) => l.product_key === productKey);
  write(
    existing
      ? lines.map((l) =>
          l.product_key === productKey
            ? { ...l, quantity: l.quantity + quantity }
            : l,
        )
      : [...lines, { product_key: productKey, quantity }],
  );
}

function setLineQuantity(productKey: string, quantity: number): void {
  write(
    lines.map((l) =>
      l.product_key === productKey ? { ...l, quantity } : l,
    ),
  );
}

function removeLine(productKey: string): void {
  write(lines.filter((l) => l.product_key !== productKey));
}

function clearCart(): void {
  write(EMPTY);
}

/**
 * Drop lines whose product is no longer sellable, keeping the persisted cart in
 * step with the catalog.
 *
 * Without this a product that gets archived, unpublished or de-priced leaves a
 * line stranded in localStorage forever: the cart sheet and the order summary
 * both resolve lines against the live catalog and simply skip it, so it is
 * invisible and unremovable — while `lineCount` still counts it, so the header
 * badge says 3 when the sheet lists 2. Worse, checkout still POSTed it and
 * `enrichOrderItems` answered "Ürün bulunamadı: <key>", naming an internal key
 * for a row the customer cannot see or delete. Every future checkout in that
 * browser failed the same way, with DevTools the only escape.
 *
 * Callers MUST pass a catalog they know loaded — pruning against the empty array
 * a failed fetch produces would delete the whole basket.
 */
function retainLines(sellableKeys: ReadonlySet<string>): void {
  const kept = lines.filter((l) => sellableKeys.has(l.product_key));
  // Reference-equal when nothing was stale, so subscribers don't re-render.
  if (kept.length !== lines.length) write(kept);
}

// ---- Hooks ------------------------------------------------------------------

const alwaysTrue = () => true;
const alwaysFalse = () => false;
const noopSubscribe = () => () => {};

export interface CartApi {
  readonly lines: readonly CartLine[];
  readonly lineCount: number;
  readonly hydrated: boolean;
  getQuantity: (productKey: string) => number;
  addItem: (productKey: string, quantity: number) => void;
  setQuantity: (productKey: string, quantity: number) => void;
  removeItem: (productKey: string) => void;
  clear: () => void;
  /** Prune lines missing from the live catalog. Pass a NON-EMPTY key set — see
   *  retainLines; pruning against a failed catalog load empties the basket. */
  retainOnly: (sellableKeys: ReadonlySet<string>) => void;
}

export function useCart(): CartApi {
  const cartLines = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  // False on the server + first hydration render, true thereafter — lets the UI
  // avoid flashing an "empty" state before the persisted cart is read.
  const hydrated = useSyncExternalStore(noopSubscribe, alwaysTrue, alwaysFalse);

  const getQuantity = useCallback(
    (productKey: string): number =>
      cartLines.find((l) => l.product_key === productKey)?.quantity ?? 0,
    [cartLines],
  );

  return {
    lines: cartLines,
    lineCount: cartLines.length,
    hydrated,
    getQuantity,
    addItem: addLine,
    setQuantity: setLineQuantity,
    removeItem: removeLine,
    clear: clearCart,
    retainOnly: retainLines,
  };
}

/**
 * Kept as a passthrough so the shop layout has a stable client boundary to wrap
 * the tree (and a home for future cart-scoped context if needed). The store
 * itself is module-level, so the cart survives client navigations.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
