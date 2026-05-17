"use client";

/**
 * Number cell editor — locale-aware decimal/currency/percent display
 * with a plain `<input type="number">` editor. The Zod schema enforces
 * the numeric shape (positive, integer, range, etc.) — this editor
 * just plumbs the parsed value through.
 *
 * Display variants:
 * - "decimal" → 1.234,56 (TR locale)
 * - "currency" → ₺1.234,56
 * - "percent"  → 56%
 * - "integer"  → 1.234
 */
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { ok } from "@/shared/result";

import type { CellEditor } from "@/components/data-grid/data-grid-types";

import { z } from "zod";

export type NumberVariant = "decimal" | "currency" | "percent" | "integer";

export interface NumberCellEditorOptions {
  readonly schema: z.ZodType<number | null>;
  readonly variant?: NumberVariant;
  /** ISO 4217 code when variant=currency. Defaults to "TRY". */
  readonly currency?: string;
  readonly placeholder?: string;
  /** Allowed decimal places. Defaults to 2 for currency/decimal, 0 for
   *  integer, 0 for percent. */
  readonly decimals?: number;
}

const TR = "tr-TR";

function formatNumber(
  value: number,
  variant: NumberVariant,
  currency: string,
  decimals: number,
): string {
  if (variant === "currency") {
    return value.toLocaleString(TR, {
      style: "currency",
      currency,
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    });
  }
  if (variant === "percent") {
    return `${value.toLocaleString(TR, {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    })}%`;
  }
  return value.toLocaleString(TR, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: variant === "integer" ? 0 : 0,
  });
}

export function numberCellEditor({
  schema,
  variant = "decimal",
  currency = "TRY",
  placeholder,
  decimals = variant === "integer" || variant === "percent" ? 0 : 2,
}: NumberCellEditorOptions): CellEditor<number | null> {
  return {
    schema,
    render: (value) => (
      <span
        className={cn(
          "block truncate text-right tabular-nums",
          value === null && "text-left text-muted-foreground",
        )}
      >
        {value === null ? "—" : formatNumber(value, variant, currency, decimals)}
      </span>
    ),
    edit: ({ value, onCommit, onCancel }) => (
      <NumberCellInput
        initial={value}
        variant={variant}
        decimals={decimals}
        {...(placeholder !== undefined ? { placeholder } : {})}
        onCommit={(raw) => onCommit(raw)}
        onCancel={onCancel}
      />
    ),
    parseFromClipboard: (raw) => {
      const trimmed = raw.trim();
      if (trimmed === "") return ok(null);
      // Accept TR ("1.234,56") and EN ("1,234.56") — strip thousand
      // separators, normalize decimal mark to ".".
      const cleaned = trimmed
        .replace(/\s/g, "")
        .replace(/[%₺$€]/g, "")
        .replace(/(\d)\.(?=\d{3}(\D|$))/g, "$1") // TR thousand sep
        .replace(/(\d),(?=\d{3}(\D|$))/g, "$1") // EN thousand sep
        .replace(",", ".");
      const n = Number(cleaned);
      return ok(Number.isFinite(n) ? n : null);
    },
    toClipboard: (value) =>
      value === null ? "" : value.toString(),
  };
}

interface NumberCellInputProps {
  readonly initial: number | null;
  readonly variant: NumberVariant;
  readonly decimals: number;
  readonly placeholder?: string;
  readonly onCommit: (parsed: number | null) => void;
  readonly onCancel: () => void;
}

function NumberCellInput({
  initial,
  decimals,
  placeholder,
  onCommit,
  onCancel,
}: NumberCellInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.focus();
    node.select();
  }, []);

  const commit = (raw: string) => {
    if (raw.trim() === "") {
      onCommit(null);
      return;
    }
    const n = Number(raw);
    onCommit(Number.isFinite(n) ? n : null);
  };

  return (
    <input
      ref={inputRef}
      type="number"
      step={decimals === 0 ? "1" : `0.${"0".repeat(Math.max(0, decimals - 1))}1`}
      defaultValue={initial ?? ""}
      placeholder={placeholder}
      className="h-full w-full bg-transparent px-2 py-1 text-right text-sm tabular-nums outline-none ring-2 ring-primary/30 ring-inset"
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
          commit(e.currentTarget.value);
        }
      }}
    />
  );
}
