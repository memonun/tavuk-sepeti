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
import { Maximize2, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { DataGrid } from "@/components/data-grid/data-grid";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { OrderDetailLoader } from "@/features/orders/ui/order-detail-loader";
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
import type { Product } from "@/features/products/application/list-products";
import type { AppError } from "@/shared/errors/app-error";
import type { Result } from "@/shared/result";

/** Columns the filter builder offers, with their filter `kind` (drives the
 *  operators + value editor). Keep in sync with the FILTERABLE_COLUMNS
 *  whitelist in order.repository.ts. */
const FILTERABLE_COLUMNS: ReadonlyArray<FilterableColumn> = [
  { id: "order_number", label: "No", kind: "text" },
  {
    id: "status",
    label: "Durum",
    kind: "select",
    options: [
      { value: "pending", label: "Beklemede" },
      { value: "confirmed", label: "Onaylandı" },
      { value: "delivered", label: "Teslim Edildi" },
      { value: "cancelled", label: "İptal" },
    ],
  },
  {
    // Rota / Kargo. Filtering to "shipping" gives the cargo packing queue
    // without a separate page — save it as a view to pin it to the sidebar.
    id: "fulfillment_channel",
    label: "Kanal",
    kind: "select",
    options: [
      { value: "delivery", label: "Rota" },
      { value: "shipping", label: "Kargo" },
    ],
  },
  {
    id: "payment_status",
    label: "Ödeme",
    kind: "select",
    options: [
      { value: "pending", label: "Bekliyor" },
      { value: "partial", label: "Kısmi" },
      { value: "paid", label: "Ödendi" },
    ],
  },
  { id: "scheduled_for", label: "Teslim", kind: "date" },
  {
    id: "time_slot",
    label: "Zaman",
    kind: "select",
    options: [
      { value: "morning", label: "Sabah" },
      { value: "afternoon", label: "Öğlen" },
      { value: "evening", label: "Akşam" },
    ],
  },
  { id: "created_at", label: "Oluşturma", kind: "date" },
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
  readonly products: Product[];
  readonly toolbarExtra?: React.ReactNode;
}

export function OrderGrid({
  items,
  total,
  page,
  pageSize,
  currentFilters,
  products,
  toolbarExtra,
}: OrderGridProps) {
  // Subscribe to live orders + status-event changes — coalesced refresh so a
  // peer's edit lands here within ~1s.
  const { markLocalWrite } = useOrdersRealtime();

  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  // Row click → open the shared editable detail panel in a right-side Sheet.
  const [openRow, setOpenRow] = useState<OrderListItem | null>(null);

  // Debounced full-text search (sipariş no / müşteri adı / telefon) — mirrors
  // the `q` URL param the customers grid already uses.
  const [searchText, setSearchText] = useState(() => params.get("q") ?? "");

  useEffect(() => {
    const handle = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (searchText) next.set("q", searchText);
      else next.delete("q");
      next.delete("page");
      const search = next.toString();
      startTransition(() =>
        router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false }),
      );
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

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

  // `setOpenRow` from useState is stable across renders, so [] deps are safe.
  const columns = useMemo(() => buildOrderColumns(setOpenRow), []);

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
            <div className="relative w-52">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Sipariş no, müşteri…"
                className="h-7 pl-7 text-xs"
              />
              {searchText ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0.5 top-1/2 h-6 w-6 -translate-y-1/2 px-0"
                  onClick={() => setSearchText("")}
                  aria-label="Aramayı temizle"
                >
                  <X className="h-3 w-3" />
                </Button>
              ) : null}
            </div>
            {toolbarExtra}
            <FilterBuilder
              columns={FILTERABLE_COLUMNS}
              rules={currentFilters}
              onChange={onFiltersChange}
            />
          </div>
        }
        onCellError={(message) => toast.error(message)}
        onCellSuccess={markLocalWrite}
      />

      <Sheet
        open={openRow !== null}
        onOpenChange={(open) => {
          if (!open) setOpenRow(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto p-6 pt-12 data-[side=right]:sm:max-w-2xl"
        >
          {/* Visually-hidden title: base-ui Dialog requires a labelled title
              for a11y; the panel renders its own visible heading. */}
          <SheetTitle className="sr-only">Sipariş detayı</SheetTitle>
          {openRow ? (
            <Link
              href={`/orders/${openRow.id}`}
              aria-label="Tam sayfada aç"
              title="Tam sayfada aç"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-sm" }),
                "absolute right-12 top-3 z-10",
              )}
            >
              <Maximize2 className="h-4 w-4" />
            </Link>
          ) : null}
          {openRow ? (
            <OrderDetailLoader
              id={openRow.id}
              products={products}
              customerName={openRow.customer_name}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
