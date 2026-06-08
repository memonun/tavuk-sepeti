"use client";

/**
 * Customers DataGrid wrapper — pairs the shared <DataGrid> primitive
 * with the customers feature's column config + Server Action mutations.
 *
 * Owns the toolbar (filter chips + bulk-paste + columns menu + new
 * customer link). Page shell only renders the title row + this grid +
 * pagination.
 */
import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { DataGrid } from "@/components/data-grid/data-grid";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { CustomerDetailLoader } from "@/features/customers/ui/customer-detail-loader";
import { FilterBuilder } from "@/components/data-grid/filters/filter-builder";
import {
  serializeFiltersToQueryParam,
  type FilterRule,
  type FilterableColumn,
} from "@/components/data-grid/filters/filter-types";
import {
  CUSTOMER_COLUMN_LABELS,
  buildCustomerColumns,
} from "@/features/customers/ui/customer-grid-columns";
import { CustomerFilterBar } from "@/features/customers/ui/customer-filter-bar";
import { CustomerRowExpand } from "@/features/customers/ui/customer-row-expand";
import { addCustomerRowAction } from "@/features/customers/application/add-customer-row";
import { bulkCreateCustomersAction } from "@/features/customers/application/bulk-create-customers";
import { bulkDeleteCustomersAction } from "@/features/customers/application/bulk-delete-customers";
import { patchCustomerCellAction } from "@/features/customers/application/patch-customer-cell";
import { useCustomersRealtime } from "@/features/customers/ui/hooks/use-customers-realtime";
import {
  type CustomerCellField,
  type CustomerCellPatch,
} from "@/features/customers/domain/customer.schema";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { CustomerListItem } from "@/features/customers/domain/customer";
import type { AppError } from "@/shared/errors/app-error";
import type { Result } from "@/shared/result";

interface CustomerGridProps {
  readonly items: CustomerListItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly cities: readonly string[];
  readonly tags: readonly string[];
  readonly legacySegments: readonly string[];
  readonly currentFilters: ReadonlyArray<FilterRule>;
  readonly mapsKey: string;
}

/** Columns the filter builder offers. Keep in sync with the
 *  FILTERABLE_COLUMNS whitelist in customer.repository.ts. */
const FILTERABLE_COLUMNS: ReadonlyArray<FilterableColumn> = [
  { id: "first_name", label: "Ad" },
  { id: "last_name", label: "Soyad" },
  { id: "phone", label: "Telefon" },
  { id: "email", label: "E-posta" },
  { id: "tag", label: "Kanal" },
  { id: "legacy_segment", label: "Segment" },
];

const EDITABLE_COLUMN_IDS = new Set<CustomerCellField>([
  "first_name",
  "last_name",
  "phone",
  "email",
  "status",
  "account_type",
  "tag",
  "legacy_segment",
  "city",
]);

export function CustomerGrid({
  items,
  total,
  page,
  pageSize,
  cities,
  tags,
  legacySegments,
  currentFilters,
  mapsKey,
}: CustomerGridProps) {
  // Subscribe to live customers + addresses changes — coalesced refresh
  // so a peer's edit lands here within ~1s, and a 100-row paste from
  // another tab collapses to one refetch.
  useCustomersRealtime();

  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  // Row "Aç" → open the shared detail panel in a right-side Sheet.
  const [openId, setOpenId] = useState<string | null>(null);

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

  // `setOpenId` from useState is stable across renders, so [] deps are safe.
  const columns = useMemo(() => buildCustomerColumns(setOpenId), []);

  const onCellCommit = useCallback(
    async (
      rowId: string,
      patch: CustomerCellPatch,
    ): Promise<Result<CustomerListItem, AppError>> => {
      return patchCustomerCellAction(rowId, patch);
    },
    [],
  );

  const buildPatch = useCallback(
    (columnId: string, value: unknown): CustomerCellPatch => {
      if (!EDITABLE_COLUMN_IDS.has(columnId as CustomerCellField)) {
        throw new Error(`Cell field "${columnId}" is not in customerCellPatchSchemas.`);
      }
      return { field: columnId as CustomerCellField, value } as CustomerCellPatch;
    },
    [],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DataGrid<CustomerListItem, CustomerCellPatch>
        data={items}
        columns={columns}
        rowId={(row) => row.id}
        tableId="customers"
        totalCount={total}
        page={page}
        pageSize={pageSize}
        mutations={{
          onCellCommit,
          onAddRow: async () => {
            const result = await addCustomerRowAction();
            if (result.ok) {
              toast.success("Yeni satır eklendi.");
            }
            return result;
          },
          onBulkCreate: async (rows) => {
            const result = await bulkCreateCustomersAction(rows);
            if (result.ok) {
              toast.success(`${result.value.length} müşteri eklendi.`);
            }
            return result;
          },
          onBulkDelete: async (ids) => {
            const result = await bulkDeleteCustomersAction(ids);
            if (result.ok) {
              toast.success(`${result.value.deleted} müşteri silindi.`);
            }
            return result;
          },
        }}
        buildPatch={buildPatch}
        renderRowExpand={(row) => <CustomerRowExpand customer={row} />}
        columnLabels={CUSTOMER_COLUMN_LABELS}
        entityLabel="müşteri"
        toolbar={
          <CustomerToolbar
            cities={cities}
            tags={tags}
            legacySegments={legacySegments}
            currentFilters={currentFilters}
            onFiltersChange={onFiltersChange}
          />
        }
        onCellError={(message) => toast.error(message)}
      />

      <Sheet
        open={openId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto data-[side=right]:sm:max-w-2xl"
        >
          {/* Visually-hidden title: base-ui Dialog requires a labelled title
              for a11y; the panel renders its own visible heading. */}
          <SheetTitle className="sr-only">Müşteri detayı</SheetTitle>
          {openId ? (
            <CustomerDetailLoader id={openId} mapsKey={mapsKey} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface CustomerToolbarProps {
  readonly currentFilters: ReadonlyArray<FilterRule>;
  readonly onFiltersChange: (next: ReadonlyArray<FilterRule>) => void;
  readonly cities: readonly string[];
  readonly tags: readonly string[];
  readonly legacySegments: readonly string[];
}

function CustomerToolbar({
  cities,
  tags,
  legacySegments,
  currentFilters,
  onFiltersChange,
}: CustomerToolbarProps) {
  return (
    <div className="flex flex-1 flex-wrap items-center gap-1.5">
      <CustomerFilterBar
        cities={cities}
        tags={tags}
        legacySegments={legacySegments}
      />
      <FilterBuilder
        columns={FILTERABLE_COLUMNS}
        rules={currentFilters}
        onChange={onFiltersChange}
      />
      <Link
        href="/customers/new"
        className={cn(
          buttonVariants({ size: "sm", variant: "outline" }),
          "ml-auto h-7 gap-1 px-2 text-xs",
        )}
      >
        <Plus className="h-3 w-3" />
        Yeni Müşteri
      </Link>
    </div>
  );
}

// Re-export Button so the linter doesn't flag the import as unused if
// the toolbar evolves to plain buttons later.
void Button;
