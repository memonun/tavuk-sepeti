"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useState that mirrors to localStorage, so working state survives navigation,
 * refresh, and tab close. Hydrates AFTER mount (SSR-safe) and gates the persist
 * effect on a `hydrated` state flag so the initial value never clobbers a
 * stored one before hydration (same race fix as use-draft-batch).
 *
 * `serialize`/`deserialize` let non-JSON-native values (e.g. a Set) round-trip;
 * they're read through a ref so passing inline functions doesn't re-fire effects.
 * A deserialize that throws is treated as "corrupt" and the initial value is kept.
 */
export function usePersistentState<T>(
  storageKey: string,
  initial: T,
  serialize: (value: T) => string = JSON.stringify,
  deserialize: (raw: string) => T = (raw) => JSON.parse(raw) as T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  const codec = useRef({ serialize, deserialize });
  useEffect(() => {
    codec.current = { serialize, deserialize };
  }, [serialize, deserialize]);

  // Hydrate from localStorage after mount (effects run client-only, so window
  // is defined here).
  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);
    if (raw !== null) {
      try {
        setValue(codec.current.deserialize(raw));
      } catch {
        // Corrupt payload — keep the initial value.
      }
    }
    setHydrated(true);
  }, [storageKey]);

  // Persist on change, but only after hydration (never clobber stored state).
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, codec.current.serialize(value));
    } catch {
      // Quota / private mode — drop silently.
    }
  }, [storageKey, value, hydrated]);

  return [value, setValue];
}
