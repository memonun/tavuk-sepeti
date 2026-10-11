"use client";

/**
 * Which layers of the calendar this browser shows — per-device view state, not
 * shared data, so it lives in localStorage (parsed with Zod like any other
 * external input) and is read through useSyncExternalStore to stay
 * hydration-safe: the server and the first client render both see "all on".
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { z } from "zod";

const STORAGE_KEY = "takvim:gorunum-tercihleri";
const CHANGE_EVENT = "takvim:tercih-degisti";

const prefsSchema = z.object({
  hiddenCalendars: z.array(z.string().uuid()).max(100).catch([]),
  showReminders: z.boolean().catch(true),
  showDeliveries: z.boolean().catch(true),
});

export type CalendarPrefs = z.output<typeof prefsSchema>;

const DEFAULT_PREFS: CalendarPrefs = {
  hiddenCalendars: [],
  showReminders: true,
  showDeliveries: true,
};

function parsePrefs(raw: string): CalendarPrefs {
  if (raw === "") return DEFAULT_PREFS;
  try {
    const parsed = prefsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_PREFS;
  } catch {
    // Corrupt JSON in localStorage: fall back to showing everything.
    return DEFAULT_PREFS;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readRaw(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    // Storage blocked (private mode): behave as if nothing was saved.
    return "";
  }
}

export function useCalendarPrefs(): [CalendarPrefs, (next: CalendarPrefs) => void] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const prefs = useMemo(() => parsePrefs(raw), [raw]);

  const setPrefs = useCallback((next: CalendarPrefs) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage blocked: the choice simply won't outlive this page.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [prefs, setPrefs];
}
