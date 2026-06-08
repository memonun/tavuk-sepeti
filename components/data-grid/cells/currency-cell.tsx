"use client";

/**
 * Currency cell editor — minor-units (kuruş) storage with lira entry UX.
 *
 * The user sees and types lira (₺15,00); the editor commits an integer
 * kuruş value (1500) that the grid validates with the column's Zod schema.
 * This prevents the classic footgun where typing "15" into a raw-integer
 * editor stores ₺0,15 instead of ₺15.
 *
 * Conversion:
 *   display  → lira  = minor / 100
 *   commit   → kuruş = Math.round(lira * 100)
 *
 * Decimal separator: accepts both "." and "," (TR convention).
 * Currency symbol: strips "₺", "TRY", and whitespace on parse.
 */
import { useEffect, useRef } from "react";

import { err, ok, type Result } from "@/shared/result";
import { formatTRY, parseTRYInput } from "@/shared/utils/money";

import type { CellEditor } from "@/components/data-grid/data-grid-types";
import type { AppError } from "@/shared/errors/app-error";

import { ValidationError } from "@/shared/errors/app-error";
import { z } from "zod";

export interface CurrencyCellEditorOptions {
  /** Kuruş schema — whatever the grid uses to validate the committed integer. */
  readonly schema: z.ZodType<number>;
}

/**
 * Factory that returns a `CellEditor<number>` (kuruş ↔ lira).
 *
 * - `render(minor)` → formatted lira string via `formatTRY`
 * - `edit`          → input pre-filled with lira value; commits kuruş integer
 * - `toClipboard`   → lira string (readable clipboard)
 * - `parseFromClipboard` → lira string → kuruş integer wrapped in Result
 */
export function currencyCellEditor({
  schema,
}: CurrencyCellEditorOptions): CellEditor<number> {
  return {
    schema,
    render: (minor) => (
      <span className="block truncate text-right font-mono text-xs tabular-nums">
        {formatTRY(minor)}
      </span>
    ),
    edit: ({ value, onCommit, onCancel }) => (
      <CurrencyCellInput
        initialMinor={value}
        onCommit={(kuruş) => onCommit(kuruş)}
        onCancel={onCancel}
      />
    ),
    toClipboard: (minor) => {
      // Produce a plain lira decimal string so copy/paste yields something
      // sensible (e.g. "15.00") rather than the raw integer "1500".
      return (Number(minor) / 100).toFixed(2);
    },
    parseFromClipboard: (raw): Result<number, AppError> => {
      const trimmed = raw.trim();
      if (trimmed === "") return ok(0);
      // Strip currency symbol, TRY abbreviation, and non-numeric clutter.
      const cleaned = trimmed.replace(/₺/g, "").replace(/TRY/gi, "").trim();
      const kuruş = parseTRYInput(cleaned);
      if (kuruş === null) {
        return err(
          new ValidationError({ message: `"${raw}" geçerli bir tutar değil.` }),
        );
      }
      return ok(kuruş);
    },
  };
}

// ---- Internal input component -----------------------------------------------

interface CurrencyCellInputProps {
  readonly initialMinor: number;
  readonly onCommit: (kuruş: number) => void;
  readonly onCancel: () => void;
}

function CurrencyCellInput({ initialMinor, onCommit, onCancel }: CurrencyCellInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  // Pre-fill with the lira representation (e.g. "15.00" for 1500 kuruş).
  const initialLira = (initialMinor / 100).toFixed(2);

  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.focus();
    node.select();
  }, []);

  const commit = (raw: string) => {
    const trimmed = raw.trim().replace(/₺/g, "").replace(/TRY/gi, "").trim();
    if (trimmed === "") {
      // Empty → treat as 0 kuruş.
      onCommit(0);
      return;
    }
    const kuruş = parseTRYInput(trimmed);
    // parseTRYInput returns null for unparseable input. Fall back to 0 so
    // the Zod schema (nonnegative) — not this component — decides the fate.
    onCommit(kuruş ?? 0);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      defaultValue={initialLira}
      placeholder="0.00"
      className="h-full w-full bg-transparent px-2 py-1 text-right font-mono text-xs tabular-nums outline-none ring-2 ring-primary/30 ring-inset"
      onBlur={(e) => {
        if (cancelledRef.current) return;
        commit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(e.currentTarget.value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelledRef.current = true;
          onCancel();
        } else if (e.key === "Tab") {
          // Let focus move; commit on the way out.
          commit(e.currentTarget.value);
        }
      }}
    />
  );
}
