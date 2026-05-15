"use client";

/**
 * Header cell — sortable label + resize handle + pin/unpin menu.
 *
 * The resize handle is a 4px-wide hit zone on the right edge that
 * captures pointer events and drives `column.getResizeHandler()`. While
 * dragging, the column gets a visible "in resize" indicator class.
 *
 * Pin actions move the column to the left/right pinning slot. When
 * pinned, the menu offers "Sabitlemeyi kaldır" instead.
 */
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  MoreVertical,
  PinOff,
  Pin,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ColumnTypeIcon,
  type ColumnType,
} from "@/components/data-grid/column-type-icons";

import type { Header, RowData } from "@tanstack/react-table";
import type { DataGridColumn } from "@/components/data-grid/data-grid-types";

interface DataGridHeaderCellProps<T extends RowData> {
  readonly header: Header<T, unknown>;
  readonly children?: React.ReactNode;
}

export function DataGridHeaderCell<T extends RowData>({
  header,
  children,
}: DataGridHeaderCellProps<T>) {
  const { column } = header;
  const canSort = column.getCanSort();
  const canResize = column.getCanResize();
  const canPin = column.getCanPin();
  const sortDir = column.getIsSorted();
  const isPinned = column.getIsPinned();
  const columnType = (column.columnDef as DataGridColumn<T>).columnType as
    | ColumnType
    | undefined;

  return (
    <div className="group relative flex h-full items-center justify-between gap-1 px-2 text-[11px] font-medium tracking-wide text-muted-foreground">
      <button
        type="button"
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 text-left",
          canSort && "cursor-pointer select-none hover:text-foreground",
        )}
        onClick={canSort ? column.getToggleSortingHandler() : undefined}
        title={canSort ? "Sıralamayı değiştir" : undefined}
      >
        {columnType ? (
          <ColumnTypeIcon type={columnType} className="h-3 w-3 shrink-0 text-muted-foreground/70" />
        ) : null}
        <span className="truncate">{children}</span>
        {canSort ? <SortIndicator dir={sortDir} /> : null}
      </button>

      {canPin ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100 data-[popup-open]:opacity-100"
                aria-label="Kolon menüsü"
              />
            }
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isPinned !== "left" ? (
              <DropdownMenuItem onClick={() => column.pin("left")}>
                <Pin className="mr-2 h-3.5 w-3.5" />
                Sola sabitle
              </DropdownMenuItem>
            ) : null}
            {isPinned !== "right" ? (
              <DropdownMenuItem onClick={() => column.pin("right")}>
                <Pin className="mr-2 h-3.5 w-3.5" />
                Sağa sabitle
              </DropdownMenuItem>
            ) : null}
            {isPinned ? (
              <DropdownMenuItem onClick={() => column.pin(false)}>
                <PinOff className="mr-2 h-3.5 w-3.5" />
                Sabitlemeyi kaldır
              </DropdownMenuItem>
            ) : null}
            {column.getCanHide() ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                  Bu kolonu gizle
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {canResize ? (
        <span
          onMouseDown={header.getResizeHandler()}
          onTouchStart={header.getResizeHandler()}
          className={cn(
            "absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize touch-none select-none bg-transparent",
            "hover:bg-primary/40",
            column.getIsResizing() && "bg-primary",
          )}
          role="separator"
          aria-orientation="vertical"
        />
      ) : null}
    </div>
  );
}

function SortIndicator({ dir }: { dir: false | "asc" | "desc" }) {
  if (dir === "asc") return <ChevronUp className="h-3 w-3" />;
  if (dir === "desc") return <ChevronDown className="h-3 w-3" />;
  return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
}
