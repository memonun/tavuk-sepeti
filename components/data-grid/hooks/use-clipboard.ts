"use client";

/**
 * Copy/paste integration. Reads/writes the system clipboard via the async
 * Clipboard API where available (HTTPS / focused tab) and falls back to
 * document.execCommand for older browsers.
 *
 * The hook is deliberately stateless — caller passes in the cells to
 * copy or the target rectangle to paste into. This keeps it composable
 * with both keyboard handlers and toolbar buttons.
 */
import { useCallback } from "react";

import {
  parseClipboardTable,
  serializeClipboardTable,
  type ParseResult,
} from "@/components/data-grid/paste/parse-tsv";

export interface UseClipboardResult {
  readonly copy: (table: ReadonlyArray<ReadonlyArray<string>>) => Promise<boolean>;
  readonly readPaste: () => Promise<ParseResult | null>;
}

export function useClipboard(): UseClipboardResult {
  const copy = useCallback(
    async (table: ReadonlyArray<ReadonlyArray<string>>): Promise<boolean> => {
      const tsv = serializeClipboardTable(table);
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(tsv);
          return true;
        } catch {
          // Permission denied — fall through to legacy.
        }
      }
      return legacyCopy(tsv);
    },
    [],
  );

  const readPaste = useCallback(async (): Promise<ParseResult | null> => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
      try {
        const text = await navigator.clipboard.readText();
        return parseClipboardTable(text);
      } catch {
        // Most browsers require a user gesture for clipboard reads — when
        // that fails the caller should fall back to a paste event listener.
        return null;
      }
    }
    return null;
  }, []);

  return { copy, readPaste };
}

function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try {
    // Legacy fallback for browsers without async Clipboard API permission.
    // execCommand is deprecated but still the only sync write available.
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}
