"use client";

import { LayoutList, Table2 } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

export type PhoneView = "cards" | "table";

const OPTIONS = [
  { value: "cards", label: "Kart görünümü", icon: LayoutList },
  { value: "table", label: "Tablo görünümü", icon: Table2 },
] as const;

// The choice is remembered per list in localStorage. `memory` covers private
// mode (where storage throws) so the toggle still works for the session.
const memory = new Map<string, PhoneView>();
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readPhoneView(storageKey: string): PhoneView {
  const remembered = memory.get(storageKey);
  if (remembered) return remembered;
  try {
    return window.localStorage.getItem(storageKey) === "table" ? "table" : "cards";
  } catch {
    return "cards";
  }
}

/** Which layout a list shows on a phone. Cards until the user picks the table. */
export function usePhoneView(storageKey: string): [PhoneView, (next: PhoneView) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => readPhoneView(storageKey),
    () => "cards" as const,
  );
  const setValue = useCallback(
    (next: PhoneView) => {
      memory.set(storageKey, next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // Private mode — remembered for this session only.
      }
      for (const listener of listeners) listener();
    },
    [storageKey],
  );
  return [value, setValue];
}

/**
 * Phone-only switch between a list of cards (the default on a small screen)
 * and the full spreadsheet grid. The grid stays one tap away because it is the
 * only place for bulk selection, grouping, column choice and inline editing.
 */
export function PhoneViewToggle({
  value,
  onChange,
}: {
  value: PhoneView;
  onChange: (next: PhoneView) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Görünüm"
      data-admin-dense
      className="flex shrink-0 gap-0.5 rounded-xl bg-muted p-1"
    >
      {OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            title={option.label}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex size-9 items-center justify-center rounded-lg transition-colors",
              selected ? "bg-card text-foreground shadow-xs" : "text-muted-foreground",
            )}
          >
            <option.icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
