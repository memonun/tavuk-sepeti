"use client";

/**
 * Text cell editor — single-line input with Enter/Tab to commit, Esc to
 * cancel. The editor is auto-focused when mounted; selecting all on focus
 * matches Excel's "type to overwrite" behavior.
 *
 * The Zod schema at the column level is the validator — this component
 * just shuttles the raw string to the commit callback. Validation
 * failures show via the parent grid (red border + toast) — keeping the
 * cell input dumb means feature columns can swap the schema without
 * touching the editor.
 */
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { ok } from "@/shared/result";

import type { CellEditor } from "@/components/data-grid/data-grid-types";

import { z } from "zod";

export interface TextCellEditorOptions {
  readonly schema: z.ZodType<string | null>;
  /** Stylistic hint — affects display rendering only. */
  readonly variant?: "default" | "mono";
  /** Placeholder shown in the input when value is empty. */
  readonly placeholder?: string;
}

export function textCellEditor({
  schema,
  variant = "default",
  placeholder,
}: TextCellEditorOptions): CellEditor<string | null> {
  return {
    schema,
    render: (value) => (
      <span
        className={cn(
          "block truncate",
          variant === "mono" && "font-mono text-xs",
          value === null && "text-muted-foreground",
        )}
      >
        {value ?? "—"}
      </span>
    ),
    edit: ({ value, onCommit, onCancel }) => (
      <TextCellInput
        initial={value ?? ""}
        variant={variant}
        {...(placeholder !== undefined ? { placeholder } : {})}
        onCommit={(raw) => onCommit(raw === "" ? null : raw)}
        onCancel={onCancel}
      />
    ),
    parseFromClipboard: (raw) => ok(raw),
    toClipboard: (value) => value ?? "",
  };
}

interface TextCellInputProps {
  readonly initial: string;
  readonly variant: "default" | "mono";
  readonly placeholder?: string;
  readonly onCommit: (raw: string) => void;
  readonly onCancel: () => void;
}

function TextCellInput({
  initial,
  variant,
  placeholder,
  onCommit,
  onCancel,
}: TextCellInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.focus();
    node.select();
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      defaultValue={initial}
      placeholder={placeholder}
      className={cn(
        "h-full w-full bg-transparent px-2 py-1 text-sm outline-none ring-2 ring-primary/30 ring-inset",
        variant === "mono" && "font-mono text-xs",
      )}
      onBlur={(e) => {
        if (cancelledRef.current) return;
        onCommit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(e.currentTarget.value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelledRef.current = true;
          onCancel();
        } else if (e.key === "Tab") {
          // Let the focus move; commit on the way out.
          onCommit(e.currentTarget.value);
        }
      }}
    />
  );
}
