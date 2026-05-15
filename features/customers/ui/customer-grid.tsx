"use client";

/**
 * Customers DataGrid wrapper — pairs the shared <DataGrid> primitive
 * with the customers feature's column config + Server Action mutation.
 *
 * Receives the server-rendered list page (items + total + pagination)
 * from the Server Component shell. Cell commits go through the
 * patchCustomerCellAction Server Action; success → optimistic patch is
 * replaced with the canonical row, failure → toast + rollback.
 *
 * The page-level filter bar + pagination footer stay where they are —
 * the grid only owns the table itself.
 */
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import { DataGrid } from "@/components/data-grid/data-grid";
import {
  CUSTOMER_COLUMN_LABELS,
  buildCustomerColumns,
} from "@/features/customers/ui/customer-grid-columns";
import { CustomerRowExpand } from "@/features/customers/ui/customer-row-expand";
import { bulkCreateCustomersAction } from "@/features/customers/application/bulk-create-customers";
import { patchCustomerCellAction } from "@/features/customers/application/patch-customer-cell";
import {
  type CustomerCellField,
  type CustomerCellPatch,
} from "@/features/customers/domain/customer.schema";

import type { CustomerListItem } from "@/features/customers/domain/customer";
import type { AppError } from "@/shared/errors/app-error";
import type { Result } from "@/shared/result";

interface CustomerGridProps {
  readonly items: CustomerListItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
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

export function CustomerGrid({ items, total, page, pageSize }: CustomerGridProps) {
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
      // Narrow at the boundary so a typo in column id surfaces as a
      // discriminated-union error instead of slipping through.
      if (!EDITABLE_COLUMN_IDS.has(columnId as CustomerCellField)) {
        // The grid only invokes commit for columns marked editable; this
        // branch is defensive in case a future column toggles editable
        // without registering its field name.
        throw new Error(`Cell field "${columnId}" is not in customerCellPatchSchemas.`);
      }
      return { field: columnId as CustomerCellField, value } as CustomerCellPatch;
    },
    [],
  );

  return (
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
      }}
      buildPatch={buildPatch}
      renderRowExpand={(row) => <CustomerRowExpand customer={row} />}
      columnLabels={CUSTOMER_COLUMN_LABELS}
      entityLabel="müşteri"
      onCellError={(message) => toast.error(message)}
    />
  );
}
