"use client";

/**
 * Coordinate cell editor — displays and edits a lat/lng pair in
 * Google-Maps copy format: "38.330574, 38.429462" (6 decimal places).
 *
 * Editing: a plain text input pre-filled with the current coordinate.
 * On Enter/blur the string is split on the FIRST comma; both halves are
 * parsed with Number(). If both are finite and within valid ranges the
 * commit fires; otherwise the edit is cancelled (invalid silently discarded,
 * matching the pattern used by select-cell for unknown options).
 *
 * Clipboard paste: same parse logic — paste "38.330574, 38.429462" into
 * the cell and it just works.
 *
 * Schema: a locally declared z.object({lat,lng}) — no cross-feature import.
 * The customers grid column applies this editor; the schema on the editor
 * covers the in-grid validation path (handleCommitEdit in data-grid.tsx).
 * The server-side parse uses coordinatesSchema from customer.schema.ts,
 * which is intentionally identical.
 */
import { useEffect, useRef } from "react";

import { ValidationError } from "@/shared/errors/app-error";
import { err, ok } from "@/shared/result";

import type { CellEditor } from "@/components/data-grid/data-grid-types";

import { z } from "zod";

type Coords = { lat: number; lng: number };

// Local schema — mirrors coordinatesSchema in customer.schema.ts exactly,
// without creating a cross-feature import.
const localCoordsSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
}) as unknown as z.ZodType<Coords | null>;

function parseCoordString(raw: string): Coords | null {
  const firstComma = raw.indexOf(",");
  if (firstComma < 0) return null;
  const latStr = raw.slice(0, firstComma).trim();
  const lngStr = raw.slice(firstComma + 1).trim();
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function coordinateCellEditor(): CellEditor<Coords | null> {
  return {
    schema: localCoordsSchema,
    render: (value) =>
      value ? (
        <span className="font-mono text-xs">
          {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    edit: ({ value, onCommit, onCancel }) => (
      <CoordinateCellInput
        initial={value ? `${value.lat}, ${value.lng}` : ""}
        onCommit={(raw) => {
          const parsed = parseCoordString(raw);
          if (parsed) onCommit(parsed);
          else onCancel();
        }}
        onCancel={onCancel}
      />
    ),
    parseFromClipboard: (raw) => {
      const parsed = parseCoordString(raw.trim());
      if (!parsed) {
        return err(new ValidationError({ message: "Geçersiz koordinat." }));
      }
      return ok(parsed);
    },
    toClipboard: (value) =>
      value ? `${value.lat.toFixed(6)}, ${value.lng.toFixed(6)}` : "",
  };
}

interface CoordinateCellInputProps {
  readonly initial: string;
  readonly onCommit: (raw: string) => void;
  readonly onCancel: () => void;
}

function CoordinateCellInput({ initial, onCommit, onCancel }: CoordinateCellInputProps) {
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
      placeholder="38.330574, 38.429462"
      className="h-full w-full bg-transparent px-2 py-1 font-mono text-xs outline-none ring-2 ring-primary/30 ring-inset"
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
