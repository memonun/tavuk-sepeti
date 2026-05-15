"use client";

/**
 * Checkbox cell editor — boolean toggle that doesn't need a separate
 * edit mode. Clicking the checkbox flips the value and immediately
 * commits via the editor's onCommit (the grid wires this to the cell
 * commit pipeline). Display + edit collapse to the same UI.
 *
 * Notion's checkbox column behaves exactly the same way: no double
 * click, no Enter — single click toggles.
 */
import { ok } from "@/shared/result";

import type { CellEditor } from "@/components/data-grid/data-grid-types";

import { z } from "zod";

const checkboxSchema = z.boolean();

export function checkboxCellEditor(
  schema: z.ZodType<boolean> = checkboxSchema,
): CellEditor<boolean> {
  return {
    schema,
    render: (value) => (
      <span className="flex h-full items-center justify-center">
        <input
          type="checkbox"
          checked={value === true}
          readOnly
          tabIndex={-1}
          className="pointer-events-none h-3.5 w-3.5 accent-blue-600"
        />
      </span>
    ),
    edit: ({ value, onCommit, onCancel }) => (
      <span className="flex h-full items-center justify-center">
        <input
          type="checkbox"
          autoFocus
          defaultChecked={value === true}
          onChange={(e) => onCommit(e.target.checked)}
          onBlur={onCancel}
          className="h-3.5 w-3.5 cursor-pointer accent-blue-600"
        />
      </span>
    ),
    parseFromClipboard: (raw) => {
      const v = raw.trim().toLowerCase();
      const truthy = ["true", "1", "yes", "evet", "✓", "x", "on"];
      const falsy = ["false", "0", "no", "hayır", "hayir", "", "off"];
      if (truthy.includes(v)) return ok(true);
      if (falsy.includes(v)) return ok(false);
      // Default to false on unknown — safer than guessing true.
      return ok(false);
    },
    toClipboard: (value) => (value ? "true" : "false"),
  };
}
