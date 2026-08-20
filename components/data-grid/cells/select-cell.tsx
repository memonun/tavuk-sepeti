"use client";

/**
 * Single-choice cell editor backed by shadcn Select. Use for status / type
 * / segment columns where the input is a closed enum.
 *
 * Display mode renders the option's label (with optional badge variant);
 * edit mode opens the Select popover. Auto-opens on mount so a single
 * keystroke after entering edit mode lands in the dropdown.
 */
import { useEffect, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ValidationError } from "@/shared/errors/app-error";
import { err, ok } from "@/shared/result";

import type { CellEditor } from "@/components/data-grid/data-grid-types";

import { z } from "zod";

export interface SelectOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
  readonly badgeVariant?: "default" | "secondary" | "destructive" | "outline";
}

export interface SelectCellEditorOptions<TValue extends string> {
  readonly schema: z.ZodType<TValue>;
  readonly options: ReadonlyArray<SelectOption<TValue>>;
  readonly placeholder?: string;
}

export function selectCellEditor<TValue extends string>({
  schema,
  options,
  placeholder = "Seç…",
}: SelectCellEditorOptions<TValue>): CellEditor<TValue> {
  const optionByValue = new Map(options.map((o) => [o.value, o]));

  return {
    schema,
    render: (value) => {
      const opt = optionByValue.get(value);
      if (!opt) return <span className="text-muted-foreground">—</span>;
      if (opt.badgeVariant) {
        return <Badge variant={opt.badgeVariant}>{opt.label}</Badge>;
      }
      return <span className="truncate">{opt.label}</span>;
    },
    edit: ({ value, onCommit, onCancel }) => (
      <SelectCellInput
        initial={value}
        options={options}
        placeholder={placeholder}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    ),
    parseFromClipboard: (raw) => {
      // Match either the value or the label (case-insensitive). This
      // lets a paste of "Aktif" land on status="active".
      const trimmed = raw.trim();
      const lower = trimmed.toLowerCase();
      const found = options.find(
        (o) =>
          o.value.toLowerCase() === lower ||
          o.label.toLowerCase() === lower,
      );
      if (!found) {
        return err(
          new ValidationError({
            message: `"${trimmed}" geçerli bir seçenek değil.`,
          }),
        );
      }
      return ok(found.value);
    },
    toClipboard: (value) => optionByValue.get(value)?.label ?? value,
  };
}

interface SelectCellInputProps<TValue extends string> {
  readonly initial: TValue;
  readonly options: ReadonlyArray<SelectOption<TValue>>;
  readonly placeholder: string;
  readonly onCommit: (rawValue: unknown) => void;
  readonly onCancel: () => void;
}

function SelectCellInput<TValue extends string>({
  initial,
  options,
  placeholder,
  onCommit,
  onCancel,
}: SelectCellInputProps<TValue>) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!open) {
      // Closed without committing — treat as cancel so the cell exits
      // edit mode. Commit-by-selection takes the other path below.
      onCancel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Select
      open={open}
      onOpenChange={setOpen}
      defaultValue={initial}
      onValueChange={(next) => {
        onCommit(next);
        setOpen(false);
      }}
      items={options}
    >
      <SelectTrigger
        className={cn("h-full w-full border-0 bg-transparent px-2 ring-0")}
        autoFocus
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
