/**
 * Readonly cell wrapper — for columns the user cannot edit (id, created_at,
 * computed fields). The display side is custom; the edit side is a no-op
 * that immediately cancels (so a mistaken double-click doesn't get stuck
 * in an edit state).
 */
import type { ReactNode } from "react";

import type { CellEditor } from "@/components/data-grid/data-grid-types";

import { z } from "zod";

export function readonlyCellEditor<TValue>(
  render: (value: TValue) => ReactNode,
): CellEditor<TValue> {
  return {
    schema: z.never() as unknown as z.ZodType<TValue>,
    render,
    edit: ({ onCancel }) => {
      // Synchronously cancel — the grid won't keep the cell in edit mode.
      queueMicrotask(onCancel);
      return null;
    },
  };
}
