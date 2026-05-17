"use client";

/**
 * Date range cell editor — value is { start, end } object. Display
 * formats as "5 May - 10 May 2026" with smart date abbreviation
 * (drop the year if it's the current year, drop the month if both
 * dates fall in the same month).
 *
 * Edit mode shows two side-by-side native date inputs; commit on
 * either Enter or blur of the second field.
 */
import { useEffect, useRef, useState } from "react";

import { format, isSameMonth, isSameYear } from "date-fns";
import { tr } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { ValidationError } from "@/shared/errors/app-error";
import { err, ok } from "@/shared/result";

import type { CellEditor } from "@/components/data-grid/data-grid-types";

import { z } from "zod";

export interface DateRange {
  readonly start: Date;
  readonly end: Date;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseISODate(s: string): Date | null {
  if (!ISO_DATE_RE.test(s)) return null;
  const d = new Date(s + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatRange(start: Date, end: Date): string {
  const now = new Date();
  const sameYear = isSameYear(start, end);
  const showYear = !isSameYear(start, now) || !isSameYear(end, now);
  const sameMonth = sameYear && isSameMonth(start, end);
  if (sameMonth) {
    return `${format(start, "d", { locale: tr })} – ${format(end, showYear ? "d MMM yyyy" : "d MMM", { locale: tr })}`;
  }
  return `${format(start, sameYear ? "d MMM" : "d MMM yyyy", { locale: tr })} – ${format(end, showYear ? "d MMM yyyy" : "d MMM", { locale: tr })}`;
}

export function dateRangeCellEditor(
  schema: z.ZodType<DateRange | null>,
): CellEditor<DateRange | null> {
  return {
    schema,
    render: (value) =>
      value === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span>{formatRange(value.start, value.end)}</span>
      ),
    edit: ({ value, onCommit, onCancel }) => (
      <DateRangeInput initial={value} onCommit={onCommit} onCancel={onCancel} />
    ),
    parseFromClipboard: (raw) => {
      const trimmed = raw.trim();
      if (trimmed === "") return ok(null);
      // Accept "yyyy-MM-dd .. yyyy-MM-dd" or comma / dash separated.
      const parts = trimmed.split(/\s*[–\-—,]\s*|\s*\.\.\s*/);
      if (parts.length !== 2) {
        return err(
          new ValidationError({
            message: `"${trimmed}" geçerli bir tarih aralığı değil. Beklenen: yyyy-MM-dd .. yyyy-MM-dd`,
          }),
        );
      }
      const start = parts[0] ? parseISODate(parts[0]) : null;
      const end = parts[1] ? parseISODate(parts[1]) : null;
      if (!start || !end) {
        return err(
          new ValidationError({ message: "Geçersiz tarih biçimi (yyyy-MM-dd)." }),
        );
      }
      if (start > end) {
        return err(
          new ValidationError({ message: "Başlangıç bitişten sonra olamaz." }),
        );
      }
      return ok({ start, end });
    },
    toClipboard: (value) =>
      value === null
        ? ""
        : `${format(value.start, "yyyy-MM-dd")} .. ${format(value.end, "yyyy-MM-dd")}`,
  };
}

interface DateRangeInputProps {
  readonly initial: DateRange | null;
  readonly onCommit: (next: DateRange | null) => void;
  readonly onCancel: () => void;
}

function DateRangeInput({ initial, onCommit, onCancel }: DateRangeInputProps) {
  const [start, setStart] = useState(
    initial ? format(initial.start, "yyyy-MM-dd") : "",
  );
  const [end, setEnd] = useState(
    initial ? format(initial.end, "yyyy-MM-dd") : "",
  );
  const startRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    startRef.current?.focus();
  }, []);

  const commit = () => {
    if (cancelledRef.current) return;
    if (start === "" && end === "") {
      onCommit(null);
      return;
    }
    const s = parseISODate(start);
    const e = parseISODate(end);
    if (!s || !e) {
      onCancel();
      return;
    }
    onCommit({ start: s, end: e });
  };

  return (
    <div
      className={cn(
        "flex h-full items-center gap-1 px-1 ring-2 ring-primary/30 ring-inset",
      )}
    >
      <input
        ref={startRef}
        type="date"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        className="h-full w-1/2 bg-transparent px-1 text-xs outline-none"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cancelledRef.current = true;
            onCancel();
          }
        }}
      />
      <span className="text-muted-foreground">–</span>
      <input
        type="date"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        className="h-full w-1/2 bg-transparent px-1 text-xs outline-none"
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelledRef.current = true;
            onCancel();
          }
        }}
      />
    </div>
  );
}
