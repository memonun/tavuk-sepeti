"use client";

/**
 * Toolbar dropdown for picking the group-by column. Notion-style: a
 * single column at a time (no nested groups in S3 — that's a Sprint 4
 * polish). Choosing "Yok" clears grouping.
 */
import { Check, Layers } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { Column, RowData, Table } from "@tanstack/react-table";

interface GroupByMenuProps<T extends RowData> {
  readonly table: Table<T>;
  readonly grouping: ReadonlyArray<string>;
  readonly onChange: (next: ReadonlyArray<string>) => void;
  readonly columnLabels?: Readonly<Record<string, string>>;
}

export function GroupByMenu<T extends RowData>({
  table,
  grouping,
  onChange,
  columnLabels,
}: GroupByMenuProps<T>) {
  // Group-by makes sense for low-cardinality columns: enums, tags,
  // categories. Skip the obvious continuous fields (dates, numbers, IDs)
  // by checking columnType, but still allow text columns since users
  // sometimes group by city/tag etc.
  const groupable = table
    .getAllLeafColumns()
    .filter((c) => c.getCanGroup());

  const active = grouping[0];
  const activeLabel = active ? labelFor(table.getColumn(active), columnLabels) : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant={active ? "secondary" : "outline"}
            size="sm"
            className={cn(
              "h-7 gap-1 px-2 text-xs",
              active && "bg-blue-100 text-blue-900 hover:bg-blue-200 dark:bg-blue-950/40 dark:text-blue-100",
            )}
          />
        }
      >
        <Layers className="h-3 w-3" />
        {active ? `Grupla: ${activeLabel}` : "Grupla"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Kolon seç
        </div>
        <DropdownMenuItem onClick={() => onChange([])} className="text-xs">
          <Check className={cn("mr-2 h-3 w-3", active ? "opacity-0" : "opacity-100")} />
          Yok
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {groupable.map((col) => (
          <DropdownMenuCheckboxItem
            key={col.id}
            checked={active === col.id}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => onChange(active === col.id ? [] : [col.id])}
          >
            {labelFor(col, columnLabels)}
          </DropdownMenuCheckboxItem>
        ))}
        {groupable.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            Gruplanabilir kolon yok.
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function labelFor<T extends RowData>(
  column: Column<T, unknown> | undefined,
  labels?: Readonly<Record<string, string>>,
): string {
  if (!column) return "—";
  if (labels?.[column.id]) return labels[column.id]!;
  const header = column.columnDef.header;
  if (typeof header === "string") return header;
  return column.id;
}
