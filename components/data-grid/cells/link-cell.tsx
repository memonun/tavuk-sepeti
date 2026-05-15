"use client";

/**
 * URL / Email / Phone cell editors — display becomes a clickable <a>
 * with the right protocol prefix (https://, mailto:, tel:); edit mode
 * is a plain text input.
 *
 * The link is clickable in display mode — clicking the link opens the
 * URL without entering edit mode (the grid's onMouseDown checks for
 * <a> targets via ClickableTableRow's existing pattern, and the link
 * stops propagation here).
 */
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { ok } from "@/shared/result";
import { formatTRPhone } from "@/shared/utils/phone";

import type { CellEditor } from "@/components/data-grid/data-grid-types";

import { z } from "zod";

export type LinkVariant = "url" | "email" | "phone";

export interface LinkCellEditorOptions {
  readonly schema: z.ZodType<string | null>;
  readonly variant: LinkVariant;
  readonly placeholder?: string;
}

function hrefFor(variant: LinkVariant, value: string): string {
  if (variant === "email") return `mailto:${value}`;
  if (variant === "phone") return `tel:${value.replace(/\s/g, "")}`;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

export function linkCellEditor({
  schema,
  variant,
  placeholder,
}: LinkCellEditorOptions): CellEditor<string | null> {
  return {
    schema,
    render: (value) => {
      if (value === null || value === "") {
        return <span className="text-muted-foreground">—</span>;
      }
      const display = variant === "phone" ? formatTRPhone(value) : value;
      return (
        <a
          href={hrefFor(variant, value)}
          target={variant === "url" ? "_blank" : undefined}
          rel={variant === "url" ? "noopener noreferrer" : undefined}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-block truncate underline underline-offset-2 hover:text-foreground",
            variant === "phone" && "font-mono text-xs",
          )}
        >
          {display}
        </a>
      );
    },
    edit: ({ value, onCommit, onCancel }) => (
      <LinkCellInput
        initial={value ?? ""}
        variant={variant}
        {...(placeholder !== undefined ? { placeholder } : {})}
        onCommit={(raw) => onCommit(raw === "" ? null : raw)}
        onCancel={onCancel}
      />
    ),
    parseFromClipboard: (raw) => ok(raw.trim() === "" ? null : raw.trim()),
    toClipboard: (value) => value ?? "",
  };
}

interface LinkCellInputProps {
  readonly initial: string;
  readonly variant: LinkVariant;
  readonly placeholder?: string;
  readonly onCommit: (raw: string) => void;
  readonly onCancel: () => void;
}

function LinkCellInput({
  initial,
  variant,
  placeholder,
  onCommit,
  onCancel,
}: LinkCellInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const inputType =
    variant === "email" ? "email" : variant === "phone" ? "tel" : "url";

  return (
    <input
      ref={inputRef}
      type={inputType}
      defaultValue={initial}
      placeholder={placeholder}
      className={cn(
        "h-full w-full bg-transparent px-2 py-1 text-sm outline-none ring-2 ring-primary/30 ring-inset",
        variant === "phone" && "font-mono text-xs",
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
          onCommit(e.currentTarget.value);
        }
      }}
    />
  );
}
