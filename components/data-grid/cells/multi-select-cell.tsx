"use client";

/**
 * Multi-select cell editor — value is an array of option keys. Display
 * renders one badge per selection (truncated with "+ N more" if too
 * many to fit). Edit opens a dropdown with one checkbox per option;
 * commit happens on close (clicking outside / pressing Esc).
 *
 * Clipboard interop: paste accepts comma-separated values; copy emits
 * the same. Matches Notion's multi-select clipboard format.
 */
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ValidationError } from "@/shared/errors/app-error";
import { err, ok } from "@/shared/result";

import type { CellEditor } from "@/components/data-grid/data-grid-types";

import { z } from "zod";

export interface MultiSelectOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
  readonly badgeVariant?: "default" | "secondary" | "destructive" | "outline";
}

export interface MultiSelectCellEditorOptions<TValue extends string> {
  readonly schema: z.ZodType<readonly TValue[]>;
  readonly options: ReadonlyArray<MultiSelectOption<TValue>>;
  readonly maxVisibleBadges?: number;
}

export function multiSelectCellEditor<TValue extends string>({
  schema,
  options,
  maxVisibleBadges = 3,
}: MultiSelectCellEditorOptions<TValue>): CellEditor<readonly TValue[]> {
  const optionByValue = new Map(options.map((o) => [o.value, o]));

  return {
    schema,
    render: (value) => {
      if (value.length === 0) {
        return <span className="text-muted-foreground">—</span>;
      }
      const visible = value.slice(0, maxVisibleBadges);
      const overflow = value.length - visible.length;
      return (
        <span className="inline-flex flex-wrap items-center gap-1">
          {visible.map((v) => {
            const opt = optionByValue.get(v);
            if (!opt) return null;
            return (
              <Badge key={v} variant={opt.badgeVariant ?? "secondary"} className="text-[10px]">
                {opt.label}
              </Badge>
            );
          })}
          {overflow > 0 ? (
            <span className="text-[10px] text-muted-foreground">+{overflow}</span>
          ) : null}
        </span>
      );
    },
    edit: ({ value, onCommit, onCancel }) => (
      <MultiSelectInput
        initial={value}
        options={options}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    ),
    parseFromClipboard: (raw) => {
      const trimmed = raw.trim();
      if (trimmed === "") return ok([]);
      const tokens = trimmed.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
      const matched: TValue[] = [];
      const unmatched: string[] = [];
      for (const tok of tokens) {
        const lower = tok.toLowerCase();
        const found = options.find(
          (o) => o.value.toLowerCase() === lower || o.label.toLowerCase() === lower,
        );
        if (found) matched.push(found.value);
        else unmatched.push(tok);
      }
      if (unmatched.length > 0) {
        return err(
          new ValidationError({
            message: `Tanınmayan değerler: ${unmatched.join(", ")}`,
          }),
        );
      }
      return ok(matched);
    },
    toClipboard: (value) =>
      value
        .map((v) => optionByValue.get(v)?.label ?? v)
        .join(", "),
  };
}

interface MultiSelectInputProps<TValue extends string> {
  readonly initial: readonly TValue[];
  readonly options: ReadonlyArray<MultiSelectOption<TValue>>;
  readonly onCommit: (next: readonly TValue[]) => void;
  readonly onCancel: () => void;
}

function MultiSelectInput<TValue extends string>({
  initial,
  options,
  onCommit,
  onCancel,
}: MultiSelectInputProps<TValue>) {
  const [selected, setSelected] = useState<Set<TValue>>(new Set(initial));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Commit on click-outside; Esc cancels.
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      onCommit(Array.from(selected));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onCommit(Array.from(selected));
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [selected, onCommit, onCancel]);

  const toggle = (value: TValue) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  return (
    <div
      ref={containerRef}
      className="absolute z-30 mt-0.5 max-h-64 w-56 overflow-auto rounded-md border bg-popover p-1 text-xs shadow-md"
    >
      {options.map((opt) => {
        const checked = selected.has(opt.value);
        return (
          <button
            type="button"
            key={opt.value}
            onClick={() => toggle(opt.value)}
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left",
              "hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <input
              type="checkbox"
              checked={checked}
              readOnly
              className="h-3 w-3 accent-blue-600"
            />
            <span className="flex-1 truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
