"use client";

/**
 * Orders DataGrid wrapper — pairs the shared <DataGrid> primitive with the
 * orders feature's column config + the inline cell-patch Server Action.
 *
 * Orders are not created from the grid (no onAddRow). Bulk delete is supported
 * via onBulkDelete — cascade handles order_items + order_status_events automatically.
 * The page shell passes its date-range presets through `toolbarExtra`, which
 * sits to the left of the filter builder in the toolbar row.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";
import { toast } from "sonner";

import { DataGrid } from "@/components/data-grid/data-grid";
import { FilterBuilder } from "@/components/data-grid/filters/filter-builder";
import {
  serializeFiltersToQueryParam,
  type FilterRule,
  type FilterableColumn,
} from "@/components/data-grid/filters/filter-types";
import {
  ORDER_COLUMN_LABELS,
  buildOrderColumns,
} from "@/features/orders/ui/order-grid-columns";
import { bulkDeleteOrdersAction } from "@/features/orders/application/bulk-delete-orders";
import { patchOrderCellAction } from "@/features/orders/application/patch-order-cell";
import { useOrdersRealtime } from "@/features/orders/ui/hooks/use-orders-realtime";
import {
  type OrderCellField,
  type OrderCellPatch,
} from "@/features/orders/domain/order.schema";

import type { OrderListItem } from "@/features/orders/domain/order";
import type { AppError } from "@/shared/errors/app-error";
import type { Result } from "@/shared/result";

/** Columns the filter builder offers. Keep in sync with the
 *  FILTERABLE_COLUMNS whitelist in order.repository.ts. */
const FILTERABLE_COLUMNS: ReadonlyArray<FilterableColumn> = [
  { id: "order_number", label: "No" },
];

const EDITABLE_COLUMN_IDS = new Set<OrderCellField>([
  "status",
  "payment_status",
  "scheduled_for",
  "time_slot",
  "delivery_notes",
  "delivery_fee",
]);

interface OrderGridProps {
  readonly items: OrderListItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly currentFilters: ReadonlyArray<FilterRule>;
  readonly toolbarExtra?: React.ReactNode;
}

export function OrderGrid({
  items,
  total,
  page,
  pageSize,
  currentFilters,
  toolbarExtra,
}: OrderGridProps) {
  // Subscribe to live orders + status-event changes — coalesced refresh so a
  // peer's edit lands here within ~1s.
  useOrdersRealtime();

  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const onFiltersChange = useCallback(
    (next: ReadonlyArray<FilterRule>) => {
      const search = new URLSearchParams(params.toString());
      const serialized = serializeFiltersToQueryParam([...next]);
      if (serialized === null) search.delete("filter");
      else search.set("filter", serialized);
      // Filter change resets pagination to page 1.
      search.delete("page");
      const qs = search.toString();
      startTransition(() =>
        router.replace(qs ? `${pathname}?${qs}` : pathname, {
          scroll: false,
        }),
      );
    },
    [params, pathname, router],
  );

  const columns = useMemo(() => buildOrderColumns(), []);

  const onCellCommit = useCallback(
    (
      rowId: string,
      patch: OrderCellPatch,
    ): Promise<Result<OrderListItem, AppError>> =>
      patchOrderCellAction(rowId, patch),
    [],
  );

  const buildPatch = useCallback(
    (columnId: string, value: unknown): OrderCellPatch => {
      const field = columnId as OrderCellField;
      if (!EDITABLE_COLUMN_IDS.has(field)) {
        throw new Error(`Order field "${columnId}" is not editable.`);
      }
      return { field, value } as OrderCellPatch;
    },
    [],
  );

  // Optimistic row partial. The default identity mapping (column id === row
  // field, committed value === display value) is wrong for two columns:
  //  - status: the editor commits `{ to, reason }`, but the row stores the
  //    bare status string — surface `.to` so the cell renders a real badge.
  //  - delivery_fee: the column id is `delivery_fee` but the row field is
  //    `delivery_fee_minor` (minor units) — remap so the visible cell updates.
  const toOptimisticPatch = useCallback(
    (columnId: string, value: unknown): Partial<OrderListItem> => {
      if (columnId === "status") {
        return { status: (value as { to: OrderListItem["status"] }).to };
      }
      if (columnId === "delivery_fee") {
        return { delivery_fee_minor: Number(value) };
      }
      return { [columnId]: value } as Partial<OrderListItem>;
    },
    [],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DataGrid<OrderListItem, OrderCellPatch>
        data={items}
        columns={columns}
        rowId={(row) => row.id}
        tableId="orders"
        totalCount={total}
        page={page}
        pageSize={pageSize}
        mutations={{
          onCellCommit,
          onBulkDelete: async (ids) => {
            const result = await bulkDeleteOrdersAction(ids);
            if (result.ok) toast.success(`${result.value.deleted} sipariş silindi.`);
            return result;
          },
        }}
        buildPatch={buildPatch}
        toOptimisticPatch={toOptimisticPatch}
        columnLabels={ORDER_COLUMN_LABELS}
        toolbar={
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            {toolbarExtra}
            <FilterBuilder
              columns={FILTERABLE_COLUMNS}
              rules={currentFilters}
              onChange={onFiltersChange}
            />
          </div>
        }
        onCellError={(message) => toast.error(message)}
      />
    </div>
  );
}
