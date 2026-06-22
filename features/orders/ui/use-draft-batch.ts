// features/orders/ui/use-draft-batch.ts
"use client";

import { useCallback, useEffect, useState } from "react";

import {
  applyLine,
  clearCustomers,
  emptyBatch,
  removeLine,
  type BasketLine,
  type DraftBatch,
} from "@/features/orders/domain/draft-batch";
import {
  DRAFT_BATCH_VERSION,
  parseStoredBatch,
} from "@/features/orders/domain/draft-batch.schema";

const STORAGE_KEY = "ts:bulk-order-draft:v1";

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function useDraftBatch(initialDate: string) {
  const [batch, setBatch] = useState<DraftBatch>(() => emptyBatch(initialDate));
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount (SSR-safe).
  useEffect(() => {
    if (typeof window === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHydrated(true);
      return;
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = parseStoredBatch(safeParseJson(raw));
      if (parsed) setBatch(parsed);
    }
    setHydrated(true);
  }, []);

  // Persist on change (only after hydration, so we never clobber stored state).
  useEffect(() => {
    if (typeof window === "undefined" || !hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...batch, version: DRAFT_BATCH_VERSION }),
      );
    } catch {
      // Quota / private mode — drop silently.
    }
  }, [batch, hydrated]);

  const setDate = useCallback(
    (scheduledFor: string) => setBatch((b) => ({ ...b, scheduledFor })),
    [],
  );
  const setDefaults = useCallback(
    (defaults: DraftBatch["defaults"]) => setBatch((b) => ({ ...b, defaults })),
    [],
  );
  const apply = useCallback(
    (ids: string[], line: BasketLine) => setBatch((b) => applyLine(b, ids, line)),
    [],
  );
  const remove = useCallback(
    (ids: string[], productKey: string) => setBatch((b) => removeLine(b, ids, productKey)),
    [],
  );
  const clear = useCallback(
    (ids: string[]) => setBatch((b) => clearCustomers(b, ids)),
    [],
  );
  const reset = useCallback((date: string) => setBatch(emptyBatch(date)), []);

  return { batch, setDate, setDefaults, apply, remove, clear, reset };
}
