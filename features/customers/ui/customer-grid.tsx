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
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import { DataGrid } from "@/components/data-grid/data-grid";
import {
  CUSTOMER_COLUMN_LABELS,
  buildCustomerColumns,
} from "@/features/customers/ui/customer-grid-columns";
import { CustomerFilterBar } from "@/features/customers/ui/customer-filter-bar";
import { CustomerRowExpand } from "@/features/customers/ui/customer-row-expand";
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
}

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
}: CustomerGridProps) {
  // Subscribe to live customers + addresses changes — coalesced refresh
  // so a peer's edit lands here within ~1s, and a 100-row paste from
  // another tab collapses to one refetch.
  useCustomersRealtime();

  const columns = useMemo(() => buildCustomerColumns(), []);

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
          />
        }
        onCellError={(message) => toast.error(message)}
      />
    </div>
  );
}

interface CustomerToolbarProps {
  readonly cities: readonly string[];
  readonly tags: readonly string[];
  readonly legacySegments: readonly string[];
}

function CustomerToolbar({ cities, tags, legacySegments }: CustomerToolbarProps) {
  return (
    <div className="flex flex-1 flex-wrap items-center gap-1.5">
      <CustomerFilterBar
        cities={cities}
        tags={tags}
        legacySegments={legacySegments}
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
