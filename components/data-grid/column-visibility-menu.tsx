"use client";

/**
 * Top-right dropdown that lists every leaf column with a checkbox to
 * toggle visibility. Persisted via the column-prefs hook in the parent
 * DataGrid so reloads remember the user's choice.
 */
import { Columns3 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

import type { Column, RowData, Table } from "@tanstack/react-table";

interface ColumnVisibilityMenuProps<T extends RowData> {
  readonly table: Table<T>;
  readonly columnLabels?: Readonly<Record<string, string>>;
}

export function ColumnVisibilityMenu<T extends RowData>({
  table,
  columnLabels,
}: ColumnVisibilityMenuProps<T>) {
  const allColumns = table.getAllLeafColumns().filter((c) => c.getCanHide());

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" className="gap-1.5" />}
      >
        <Columns3 className="h-3.5 w-3.5" />
        Kolonlar
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Görünen kolonlar</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {allColumns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={column.getIsVisible()}
            onCheckedChange={(next) => column.toggleVisibility(Boolean(next))}
            onSelect={(e) => e.preventDefault()}
          >
            {labelFor(column, columnLabels)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function labelFor<T extends RowData>(
  column: Column<T, unknown>,
  labels?: Readonly<Record<string, string>>,
): string {
  if (labels?.[column.id]) return labels[column.id]!;
  const header = column.columnDef.header;
  if (typeof header === "string") return header;
  return column.id;
}
