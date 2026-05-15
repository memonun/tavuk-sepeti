"use client";

/**
 * Date cell editor — uses a native `<input type="date">` for keyboard
 * accessibility + zero JS overhead. Stores ISO yyyy-MM-dd; the row's
 * Date object is derived in the column accessor.
 *
 * For datetime columns, swap to type="datetime-local" via the variant
 * prop.
 */
import { useEffect, useRef } from "react";

import { format } from "date-fns";
import { tr } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { ValidationError } from "@/shared/errors/app-error";
import { err, ok } from "@/shared/result";

import type { CellEditor } from "@/components/data-grid/data-grid-types";

import { z } from "zod";

export interface DateCellEditorOptions {
  readonly schema: z.ZodType<Date | null>;
  readonly variant?: "date" | "datetime";
}

export function dateCellEditor({
  schema,
  variant = "date",
}: DateCellEditorOptions): CellEditor<Date | null> {
  return {
    schema,
    render: (value) => (
      <span className={cn(!value && "text-muted-foreground")}>
        {value
          ? format(value, variant === "date" ? "d MMM yyyy" : "d MMM yyyy HH:mm", {
              locale: tr,
            })
          : "—"}
      </span>
    ),
    edit: ({ value, onCommit, onCancel }) => (
      <DateCellInput
        initial={value}
        variant={variant}
        onCommit={(raw) => onCommit(raw === "" ? null : new Date(raw))}
        onCancel={onCancel}
      />
    ),
    parseFromClipboard: (raw) => {
      const trimmed = raw.trim();
      if (trimmed === "") return ok(null);
      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) {
        return err(
          new ValidationError({
            message: `"${trimmed}" geçerli bir tarih değil.`,
          }),
        );
      }
      return ok(parsed);
    },
    toClipboard: (value) =>
      value
        ? format(
            value,
            variant === "date" ? "yyyy-MM-dd" : "yyyy-MM-dd'T'HH:mm",
          )
        : "",
  };
}

interface DateCellInputProps {
  readonly initial: Date | null;
  readonly variant: "date" | "datetime";
  readonly onCommit: (raw: string) => void;
  readonly onCancel: () => void;
}

function DateCellInput({ initial, variant, onCommit, onCancel }: DateCellInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const inputType = variant === "date" ? "date" : "datetime-local";
  const initialValue = initial
    ? variant === "date"
      ? format(initial, "yyyy-MM-dd")
      : format(initial, "yyyy-MM-dd'T'HH:mm")
    : "";

  return (
    <input
      ref={inputRef}
      type={inputType}
      defaultValue={initialValue}
      className="h-full w-full bg-transparent px-2 py-1 text-sm outline-none ring-2 ring-primary/30 ring-inset"
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
        }
      }}
    />
  );
}
