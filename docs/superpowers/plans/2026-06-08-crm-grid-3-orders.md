# CRM Grid — Plan 3: Orders grid + relations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static Orders table with a full `DataGrid` (sort/filter/group/virtualize/views/realtime), add safe inline edits (status via the state machine, payment_status, scheduled_for, time_slot, delivery_notes, delivery_fee), an Order→Client link column, the customer-detail Orders list, and block-with-message on deleting a customer that has orders.

**Architecture:** Mirror the customers grid. Orders stay creation-locked to the existing form (items/pricing/snapshots/RPC); only a safe field set is inline-editable. `status` edits route through the existing `transitionOrderAction` (state-machine reducer + `transition_order_status` RPC). A new `patchOrderCellAction` handles the plain fields + `payment_status`/`paid_at` consistency. `listOrders` gains sort/filter/`customer_id`. Customer delete pre-checks order counts and blocks the whole batch with a clear message.

**Tech Stack:** Next.js 16 App Router, Supabase, Zod, the shared `DataGrid`, `@tanstack/react-table`, Vitest. Prereq: **Plans 1 + 2 merged** (uses the shared grid + the detail panel's `ordersSlot`).

**Source design:** `docs/superpowers/specs/2026-06-08-crm-grid-gap-closure-design.md` (Part D + §8 #7).

---

## File Structure

- Modify: `features/orders/domain/order.ts` — add `delivery_notes`, `delivery_fee_minor` to `OrderListItem`.
- Modify: `features/orders/domain/order.schema.ts` — `orderCellPatchSchema`; extend `orderListQuerySchema` (sort/order/filters/customer_id).
- Create: `features/orders/domain/order.schema.test.ts` — cell-patch + paid_at rule tests.
- Modify: `features/orders/infrastructure/order.mapper.ts` — new list fields.
- Modify: `features/orders/infrastructure/order.repository.ts` — `patchOrderCell`, `findOrderListItemById`, list sort/filter/customer_id, `countOrdersByCustomer`.
- Create: `features/orders/application/patch-order-cell.ts` — Server Action.
- Create: `features/orders/ui/order-grid.tsx` + `order-grid-columns.tsx` — the grid.
- Create: `features/orders/ui/order-status-cell.tsx` — state-machine status editor + cancel-reason dialog.
- Create: `features/orders/ui/customer-orders-list.tsx` — read-only orders list for the detail panel.
- Modify: `app/(admin)/orders/page.tsx` — render `OrderGrid` + views + pagination.
- Modify: `features/customers/infrastructure/customer.repository.ts` + `application/bulk-delete-customers.ts` — on-delete pre-check.
- Delete: `features/orders/ui/order-table.tsx` (after the page swap).
- Create: `supabase/migrations/<ts>_realtime_orders.sql` — realtime publication.

---

## Task 1: Domain — extend `OrderListItem`

**Files:**
- Modify: `features/orders/domain/order.ts`

- [ ] **Step 1: Add the two fields**

In the `OrderListItem` interface, add after `payment_status`:

```ts
  readonly delivery_notes: string | null;
  readonly delivery_fee_minor: number;
```

- [ ] **Step 2: Typecheck (expect mapper error next)**

Run: `pnpm typecheck`
Expected: error in `order.mapper.ts` `rowToListItem` (missing fields). Next task.

- [ ] **Step 3: Commit**

```bash
git add features/orders/domain/order.ts
git commit -m "feat(orders): add delivery_notes + delivery_fee to OrderListItem"
```

---

## Task 2: Schemas — cell-patch + extended list query (test first)

**Files:**
- Modify: `features/orders/domain/order.schema.ts`
- Test: `features/orders/domain/order.schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// features/orders/domain/order.schema.test.ts
import { describe, expect, it } from "vitest";

import { orderCellPatchSchema, orderListQuerySchema } from "@/features/orders/domain/order.schema";

describe("orderCellPatchSchema", () => {
  it("accepts a scheduled_for date patch", () => {
    const r = orderCellPatchSchema.safeParse({ field: "scheduled_for", value: "2026-06-10" });
    expect(r.success).toBe(true);
  });
  it("rejects a bad date", () => {
    const r = orderCellPatchSchema.safeParse({ field: "scheduled_for", value: "10-06-2026" });
    expect(r.success).toBe(false);
  });
  it("accepts a status patch with optional reason", () => {
    const r = orderCellPatchSchema.safeParse({ field: "status", value: { to: "cancelled", reason: "stokta yok" } });
    expect(r.success).toBe(true);
  });
  it("accepts delivery_fee as a non-negative integer (kuruş)", () => {
    const r = orderCellPatchSchema.safeParse({ field: "delivery_fee", value: 1500 });
    expect(r.success).toBe(true);
  });
  it("rejects negative delivery_fee", () => {
    const r = orderCellPatchSchema.safeParse({ field: "delivery_fee", value: -1 });
    expect(r.success).toBe(false);
  });
});

describe("orderListQuerySchema (extended)", () => {
  it("defaults sort/order and accepts customer_id", () => {
    const r = orderListQuerySchema.safeParse({ customer_id: "11111111-1111-1111-1111-111111111111" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sort).toBe("scheduled_for");
      expect(r.data.order).toBe("desc");
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run features/orders/domain/order.schema.test.ts`
Expected: FAIL — `orderCellPatchSchema` undefined; `orderListQuerySchema` lacks `sort`/`customer_id`.

- [ ] **Step 3: Add the schemas**

Append to `order.schema.ts`:

```ts
import { filterRuleListSchema } from "@/shared/filter/filter-rule";

/** Sortable columns on the orders grid. Constrained so the URL can't ask
 *  the DB to sort by an unindexed/sensitive column. */
export const orderSortFieldSchema = z.enum([
  "order_number",
  "status",
  "scheduled_for",
  "payment_status",
  "total_minor",
  "created_at",
]);
export type OrderSortField = z.output<typeof orderSortFieldSchema>;

/** Status transition payload for an inline status edit. `reason` is
 *  required for cancellations (enforced by the state machine downstream). */
const statusPatchValue = z.object({
  to: z.enum(["pending", "confirmed", "delivered", "cancelled"]),
  reason: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().max(1000).nullable().default(null),
  ),
});

export const orderCellPatchSchemas = {
  status: statusPatchValue,
  payment_status: z.enum(["pending", "paid", "failed", "refunded"]),
  scheduled_for: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-MM-DD olmalı."),
  time_slot: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.enum(["morning", "afternoon", "evening"]).nullable(),
  ),
  delivery_notes: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().max(2000).nullable(),
  ),
  delivery_fee: z.coerce.number().int().nonnegative("Negatif olamaz."),
} as const;

export type OrderCellField = keyof typeof orderCellPatchSchemas;

export const orderCellPatchSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("status"), value: orderCellPatchSchemas.status }),
  z.object({ field: z.literal("payment_status"), value: orderCellPatchSchemas.payment_status }),
  z.object({ field: z.literal("scheduled_for"), value: orderCellPatchSchemas.scheduled_for }),
  z.object({ field: z.literal("time_slot"), value: orderCellPatchSchemas.time_slot }),
  z.object({ field: z.literal("delivery_notes"), value: orderCellPatchSchemas.delivery_notes }),
  z.object({ field: z.literal("delivery_fee"), value: orderCellPatchSchemas.delivery_fee }),
]);
export type OrderCellPatch = z.output<typeof orderCellPatchSchema>;
```

Then extend `orderListQuerySchema` (replace the existing object) to add sort/order/filters/customer_id:

```ts
export const orderListQuerySchema = z.object({
  status: z.enum(["pending", "confirmed", "delivered", "cancelled"]).optional(),
  scheduled_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scheduled_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customer_id: z.string().uuid().optional(),
  sort: orderSortFieldSchema.default("scheduled_for"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  filters: filterRuleListSchema.default([]),
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run features/orders/domain/order.schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/orders/domain/order.schema.ts features/orders/domain/order.schema.test.ts
git commit -m "feat(orders): order cell-patch schema + extended list query"
```

---

## Task 3: Mapper — populate new list fields

**Files:**
- Modify: `features/orders/infrastructure/order.mapper.ts`

- [ ] **Step 1: Add the fields to `ListOrderRow` + `rowToListItem`**

In `order.mapper.ts`, extend the `ListOrderRow` interface with:

```ts
  delivery_notes: string | null;
  delivery_fee_minor: number;
```

And in `rowToListItem`, add to the returned object:

```ts
  delivery_notes: row.delivery_notes,
  delivery_fee_minor: row.delivery_fee_minor,
```

- [ ] **Step 2: Typecheck (expect repo select error next)**

Run: `pnpm typecheck`
Expected: error where `listOrders` builds the `ListOrderRow` (select string lacks the columns). Next task.

- [ ] **Step 3: Commit**

```bash
git add features/orders/infrastructure/order.mapper.ts
git commit -m "feat(orders): map delivery_notes + delivery_fee in list projection"
```

---

## Task 4: Repository — list sort/filter/customer_id, patch, count, list-item-by-id

**Files:**
- Modify: `features/orders/infrastructure/order.repository.ts`

- [ ] **Step 1: Add columns to the `listOrders` select**

Update the `.select(...)` string (currently `"id, order_number, customer_id, status, scheduled_for, time_slot, total_minor, payment_status, created_at, customers!inner(first_name, last_name)"`) to include the two new columns:

```ts
.select(
  "id, order_number, customer_id, status, scheduled_for, time_slot, total_minor, payment_status, delivery_notes, delivery_fee_minor, created_at, customers!inner(first_name, last_name)",
)
```

Pass them through to `rowToListItem({ ...row, delivery_notes: row.delivery_notes, delivery_fee_minor: row.delivery_fee_minor, ... })`.

- [ ] **Step 2: Apply sort, customer_id, and the advanced filters**

Replace the fixed `.order("scheduled_for", ...).order("created_at", ...)` with query-driven sorting + the new filters. Follow the pattern in `customer.repository.ts` `listCustomers` (filter whitelist + operator mapping). Sketch:

```ts
// after building `builder` with status / scheduled_from / scheduled_to:
if (query.customer_id) builder = builder.eq("customer_id", query.customer_id);

// advanced AND filters (whitelist to avoid injection / unindexed sorts):
const ORDER_FILTERABLE = new Set(["order_number", "status", "payment_status"]);
for (const rule of query.filters) {
  if (!ORDER_FILTERABLE.has(rule.column)) continue;
  // map operator → PostgREST exactly as customer.repository.ts does
  // (contains→ilike %v%, equals→eq, starts_with→ilike v%, ends_with→ilike %v,
  //  is_empty→is null/empty, is_not_empty→not null & neq '')
}

builder = builder.order(query.sort, { ascending: query.order === "asc" });
if (query.sort !== "created_at") builder = builder.order("created_at", { ascending: false });
```

> Extract the operator-mapping into a shared helper if you want to DRY it with customers — optional. Keep the secondary `created_at` tiebreak.

- [ ] **Step 2b: Index for new sortable columns**

`status`, `scheduled_for`, `customer_id` already have indexes (migration 012). `order_number` is UNIQUE (indexed). `payment_status` and `total_minor` are new sort targets — add a migration only if a sort by them is expected to be common; otherwise note in the PR that they sort without a dedicated index (acceptable for the Faz-1 row counts). **Decision:** add `orders_payment_status_idx` in the realtime migration (Task 11) with a justification comment.

- [ ] **Step 3: Add `findOrderListItemById`**

```ts
export async function findOrderListItemById(
  id: string,
): Promise<Result<OrderListItem, ExternalApiError>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, customer_id, status, scheduled_for, time_slot, total_minor, payment_status, delivery_notes, delivery_fee_minor, created_at, customers!inner(first_name, last_name)",
    )
    .eq("id", id)
    .single();
  if (error || !data) {
    return err(new ExternalApiError({ message: error?.message ?? "Not found.", cause: error }));
  }
  return ok(rowToListItem(data as never));
}
```

- [ ] **Step 4: Add `patchOrderCell` (plain fields only)**

`status` is handled by `transitionOrderAction`, not here. This writes the direct-update fields + `payment_status`/`paid_at` consistency:

```ts
import type { OrderCellField } from "@/features/orders/domain/order.schema";

export async function patchOrderCell(
  orderId: string,
  field: Exclude<OrderCellField, "status">,
  value: unknown,
): Promise<Result<OrderListItem, ExternalApiError>> {
  const supabase = await createServerClient();
  const update: Record<string, unknown> = {};
  switch (field) {
    case "payment_status":
      update.payment_status = value;
      // paid_at consistency (DB CHECK enforces it too).
      update.paid_at = value === "paid" ? new Date().toISOString() : null;
      break;
    case "scheduled_for":
      update.scheduled_for = value;
      break;
    case "time_slot":
      update.time_slot = value;
      break;
    case "delivery_notes":
      update.delivery_notes = value;
      break;
    case "delivery_fee":
      update.delivery_fee_minor = value; // total_minor is generated — do not set it
      break;
  }
  const { error } = await supabase.from("orders").update(update).eq("id", orderId);
  if (error) {
    logger.error({ orderId, field, code: error.code }, "patch_order_cell_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return findOrderListItemById(orderId);
}
```

- [ ] **Step 5: Add `countOrdersByCustomer` (for on-delete pre-check)**

```ts
export async function countOrdersByCustomer(
  customerIds: ReadonlyArray<string>,
): Promise<Result<Map<string, number>, ExternalApiError>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select("customer_id")
    .in("customer_id", [...customerIds]);
  if (error) {
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.customer_id, (counts.get(row.customer_id) ?? 0) + 1);
  }
  return ok(counts);
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add features/orders/infrastructure/order.repository.ts
git commit -m "feat(orders): list sort/filter/customer_id, patchOrderCell, counts"
```

---

## Task 5: `patch-order-cell` Server Action

**Files:**
- Create: `features/orders/application/patch-order-cell.ts`

- [ ] **Step 1: Write the action (routes status → transition, others → direct)**

```ts
"use server";

/**
 * Inline cell edit for the orders grid. status routes through the state
 * machine (transitionOrderAction); the other safe fields go direct via
 * patchOrderCell. Returns the fresh OrderListItem so the grid swaps its
 * optimistic patch for the canonical row.
 */
import { orderCellPatchSchema, type OrderCellPatch } from "@/features/orders/domain/order.schema";
import {
  findOrderListItemById,
  patchOrderCell as repoPatch,
} from "@/features/orders/infrastructure/order.repository";
import { transitionOrderAction } from "@/features/orders/application/transition-order";
import { assertAdmin } from "@/features/auth/application/assert-admin";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

import type { OrderListItem } from "@/features/orders/domain/order";

export async function patchOrderCellAction(
  orderId: string,
  patch: OrderCellPatch,
): Promise<Result<OrderListItem, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);
  const user = auth.value;

  const parsed = orderCellPatchSchema.safeParse(patch);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz değer.",
        details: parsed.error.flatten(),
      }),
    );
  }

  // status → state machine. transitionOrderAction validates the graph +
  // cancel-reason, persists via RPC, writes its own audit event.
  if (parsed.data.field === "status") {
    const { to, reason } = parsed.data.value;
    const res = await transitionOrderAction({ order_id: orderId, to_status: to, reason });
    if (res.status === "error") {
      return err(new ValidationError({ message: res.message }));
    }
    return findOrderListItemById(orderId);
  }

  const result = await repoPatch(orderId, parsed.data.field, parsed.data.value);
  if (!result.ok) {
    logger.error({ orderId, field: parsed.data.field, code: result.error.code }, "patch_order_cell_action_failed");
    return err(result.error);
  }

  await logAudit({
    actor_id: user.id,
    action: "order.updated",
    entity_type: "order",
    entity_id: orderId,
    before: null,
    after: { [parsed.data.field]: parsed.data.value },
    metadata: { source: "data_grid_inline_edit", field: parsed.data.field },
  });

  return ok(result.value);
}
```

> Confirm `logAudit`'s `action` union has `"order.updated"`; if not, add it to the audit action enum (and its migration if the enum is DB-backed) or reuse an existing order action. Check `shared/audit/log-audit.ts`.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add features/orders/application/patch-order-cell.ts
git commit -m "feat(orders): patch-order-cell action (status via state machine)"
```

---

## Task 6: Status cell editor (state-machine + cancel reason)

**Files:**
- Create: `features/orders/ui/order-status-cell.tsx`

- [ ] **Step 1: Build a status editor that offers only legal transitions**

Use the pure `canTransition`/`ALLOWED` graph (via `transitionOrder` reducer is overkill for options — expose allowed targets). Add a tiny helper to the state machine if missing:

```ts
// in features/orders/domain/order-state-machine.ts, add:
export function allowedTransitions(from: OrderStatus): OrderStatus[] {
  return [...ALLOWED[from]];
}
```

Then the cell editor (a `CellEditor<OrderStatus>` consumed by the column):

```tsx
"use client";

import { useState } from "react";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { allowedTransitions } from "@/features/orders/domain/order-state-machine";

import type { OrderStatus } from "@/features/orders/domain/order";
import type { CellEditor } from "@/components/data-grid/data-grid-types";

import { z } from "zod";

const LABELS: Record<OrderStatus, string> = {
  pending: "Bekliyor", confirmed: "Onaylı", delivered: "Teslim", cancelled: "İptal",
};
const VARIANT: Record<OrderStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary", confirmed: "default", delivered: "outline", cancelled: "destructive",
};

/** The commit value is { to, reason } so the grid's buildPatch can wrap it
 *  into an orderCellPatch. */
export const orderStatusEditor: CellEditor<OrderStatus> = {
  schema: z.enum(["pending", "confirmed", "delivered", "cancelled"]) as unknown as z.ZodType<OrderStatus>,
  render: (value) => <Badge variant={VARIANT[value]}>{LABELS[value]}</Badge>,
  edit: ({ value, onCommit, onCancel }) => (
    <StatusInput current={value} onCommit={onCommit} onCancel={onCancel} />
  ),
};

function StatusInput({
  current, onCommit, onCancel,
}: {
  current: OrderStatus;
  onCommit: (raw: unknown) => void;
  onCancel: () => void;
}) {
  const [pendingCancel, setPendingCancel] = useState(false);
  const [reason, setReason] = useState("");
  const targets = allowedTransitions(current);

  if (targets.length === 0) {
    // terminal — nothing to change
    queueMicrotask(onCancel);
    return null;
  }

  return (
    <>
      <Select
        defaultOpen
        onValueChange={(to) => {
          if (to === "cancelled") setPendingCancel(true);
          else onCommit({ to, reason: null });
        }}
      >
        <SelectTrigger className="h-7"><SelectValue placeholder={LABELS[current]} /></SelectTrigger>
        <SelectContent>
          {targets.map((t) => (
            <SelectItem key={t} value={t}>{LABELS[t]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={pendingCancel} onOpenChange={(o) => { if (!o) { setPendingCancel(false); onCancel(); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>İptal nedeni</DialogTitle></DialogHeader>
          <textarea
            className="min-h-20 w-full rounded-md border border-border bg-background p-2 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Neden iptal ediliyor?"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setPendingCancel(false); onCancel(); }}>Vazgeç</Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length === 0}
              onClick={() => onCommit({ to: "cancelled", reason })}
            >
              İptal et
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

> Confirm `Dialog`/`Select` exports against `components/ui/`. The editor's commit value is an object — the orders `buildPatch` (Task 7) maps `columnId === "status"` to `{ field: "status", value }`.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add features/orders/ui/order-status-cell.tsx features/orders/domain/order-state-machine.ts
git commit -m "feat(orders): state-machine status cell editor with cancel reason"
```

---

## Task 7: Order grid columns + grid wrapper

**Files:**
- Create: `features/orders/ui/order-grid-columns.tsx`
- Create: `features/orders/ui/order-grid.tsx`

- [ ] **Step 1: Columns**

```tsx
// features/orders/ui/order-grid-columns.tsx
import Link from "next/link";

import { dateCellEditor } from "@/components/data-grid/cells/date-cell";
import { readonlyCellEditor } from "@/components/data-grid/cells/readonly-cell";
import { selectCellEditor } from "@/components/data-grid/cells/select-cell";
import { textCellEditor } from "@/components/data-grid/cells/text-cell";
import type { DataGridColumn } from "@/components/data-grid/data-grid-types";
import { orderStatusEditor } from "@/features/orders/ui/order-status-cell";
import { orderCellPatchSchemas } from "@/features/orders/domain/order.schema";
import { formatDate } from "@/shared/utils/date";
import { formatTRY } from "@/shared/utils/money"; // confirm the money formatter path

import type { OrderListItem } from "@/features/orders/domain/order";
import { z } from "zod";

const PAYMENT_OPTIONS = [
  { value: "pending", label: "Bekliyor", badgeVariant: "secondary" as const },
  { value: "paid", label: "Ödendi", badgeVariant: "default" as const },
  { value: "failed", label: "Başarısız", badgeVariant: "destructive" as const },
  { value: "refunded", label: "İade", badgeVariant: "outline" as const },
];
const TIME_SLOT_OPTIONS = [
  { value: "morning", label: "Sabah" },
  { value: "afternoon", label: "Öğlen" },
  { value: "evening", label: "Akşam" },
];

export const ORDER_COLUMN_LABELS: Readonly<Record<string, string>> = {
  order_number: "No", customer: "Müşteri", status: "Durum", scheduled_for: "Teslim",
  time_slot: "Zaman", payment_status: "Ödeme", delivery_fee: "Teslim Ücreti",
  total: "Tutar", delivery_notes: "Not", created_at: "Oluşturma",
};

export function buildOrderColumns(): DataGridColumn<OrderListItem>[] {
  return [
    {
      id: "order_number", accessorKey: "order_number", header: "No", size: 130,
      columnType: "text", defaultPin: "left", editable: false,
      cell: ({ row }) => (
        <Link href={`/orders/${row.original.id}`} className="font-mono text-xs underline-offset-2 hover:underline">
          {row.original.order_number}
        </Link>
      ),
    },
    {
      id: "customer", accessorKey: "customer_name", header: "Müşteri", size: 200,
      columnType: "person", editable: false,
      cell: ({ row }) => {
        const name = row.original.customer_name?.trim();
        return (
          <Link href={`/customers/${row.original.customer_id}`} className="text-sm underline-offset-2 hover:underline">
            {name && name.length > 0 ? name : "(isimsiz)"}
          </Link>
        );
      },
    },
    {
      id: "status", accessorKey: "status", header: "Durum", size: 130,
      columnType: "select", editable: true, editor: orderStatusEditor as never,
    },
    {
      id: "scheduled_for", accessorKey: "scheduled_for", header: "Teslim", size: 130,
      columnType: "date", editable: true,
      editor: dateCellEditor({ schema: orderCellPatchSchemas.scheduled_for as unknown as z.ZodType<string> }) as never,
    },
    {
      id: "time_slot", accessorKey: "time_slot", header: "Zaman", size: 110,
      columnType: "select", editable: true,
      editor: selectCellEditor({ schema: orderCellPatchSchemas.time_slot as unknown as z.ZodType<string>, options: TIME_SLOT_OPTIONS }) as never,
    },
    {
      id: "payment_status", accessorKey: "payment_status", header: "Ödeme", size: 120,
      columnType: "select", editable: true,
      editor: selectCellEditor({ schema: orderCellPatchSchemas.payment_status as unknown as z.ZodType<string>, options: PAYMENT_OPTIONS }) as never,
    },
    {
      id: "delivery_fee", accessorKey: "delivery_fee_minor", header: "Teslim Ücreti", size: 120,
      columnType: "number", editable: true,
      editor: textCellEditor({ schema: orderCellPatchSchemas.delivery_fee as unknown as z.ZodType<string | null>, variant: "mono" }) as never,
      cell: ({ getValue }) => <span className="font-mono text-xs">{formatTRY(getValue() as number)}</span>,
    },
    {
      id: "total", accessorKey: "total_minor", header: "Tutar", size: 120,
      columnType: "number", editable: false,
      editor: readonlyCellEditor<number>((v) => <span className="font-mono text-xs">{formatTRY(v)}</span>) as never,
      cell: ({ getValue }) => <span className="font-mono text-xs font-medium">{formatTRY(getValue() as number)}</span>,
    },
    {
      id: "delivery_notes", accessorKey: "delivery_notes", header: "Not", size: 200,
      columnType: "text", editable: true,
      editor: textCellEditor({ schema: orderCellPatchSchemas.delivery_notes as unknown as z.ZodType<string | null> }) as never,
    },
    {
      id: "created_at", accessorKey: "created_at", header: "Oluşturma", size: 130,
      columnType: "datetime", editable: false,
      cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{formatDate(getValue() as Date)}</span>,
    },
  ];
}
```

> `created_at` arrives as a string in `OrderListItem` (the mapper returns `row.created_at` as-is). Confirm whether it's `string` or `Date`; if string, format via `formatDate(new Date(value))` or adjust the type. `formatTRY` lives in a money util — confirm the path (search `formatTRY`).

- [ ] **Step 2: Grid wrapper**

```tsx
// features/orders/ui/order-grid.tsx
"use client";

import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import { DataGrid } from "@/components/data-grid/data-grid";
import { FilterBuilder } from "@/components/data-grid/filters/filter-builder";
import type { FilterableColumn, FilterRule } from "@/components/data-grid/filters/filter-types";
import { ORDER_COLUMN_LABELS, buildOrderColumns } from "@/features/orders/ui/order-grid-columns";
import { patchOrderCellAction } from "@/features/orders/application/patch-order-cell";
import { useOrdersRealtime } from "@/features/orders/ui/hooks/use-orders-realtime";

import type { OrderCellPatch, OrderCellField } from "@/features/orders/domain/order.schema";
import type { OrderListItem } from "@/features/orders/domain/order";
import type { AppError } from "@/shared/errors/app-error";
import type { Result } from "@/shared/result";

const FILTERABLE_COLUMNS: ReadonlyArray<FilterableColumn> = [
  { id: "order_number", label: "No" },
];

const EDITABLE = new Set<OrderCellField>([
  "status", "payment_status", "scheduled_for", "time_slot", "delivery_notes", "delivery_fee",
]);

interface OrderGridProps {
  readonly items: OrderListItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly currentFilters: ReadonlyArray<FilterRule>;
  readonly toolbarExtra?: React.ReactNode; // date-range presets slot
}

export function OrderGrid({ items, total, page, pageSize, currentFilters, toolbarExtra }: OrderGridProps) {
  useOrdersRealtime();
  const columns = useMemo(() => buildOrderColumns(), []);

  const onCellCommit = useCallback(
    (rowId: string, patch: OrderCellPatch): Promise<Result<OrderListItem, AppError>> =>
      patchOrderCellAction(rowId, patch),
    [],
  );

  const buildPatch = useCallback((columnId: string, value: unknown): OrderCellPatch => {
    const field = columnId === "delivery_fee" ? "delivery_fee" : (columnId as OrderCellField);
    if (!EDITABLE.has(field)) throw new Error(`Order field "${columnId}" is not editable.`);
    return { field, value } as OrderCellPatch;
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DataGrid<OrderListItem, OrderCellPatch>
        data={items}
        columns={columns}
        rowId={(r) => r.id}
        tableId="orders"
        totalCount={total}
        page={page}
        pageSize={pageSize}
        mutations={{ onCellCommit }}
        buildPatch={buildPatch}
        columnLabels={ORDER_COLUMN_LABELS}
        entityLabel="sipariş"
        toolbar={
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            {toolbarExtra}
            <FilterBuilder columns={FILTERABLE_COLUMNS} rules={currentFilters} onChange={() => { /* wire URL like CustomerGrid */ }} />
          </div>
        }
        onCellError={(message) => toast.error(message)}
      />
    </div>
  );
}
```

> Wire `onChange` for the filter builder to URL params exactly as `CustomerGrid.onFiltersChange` does (copy that handler). No `onBulkCreate`/`onAddRow`/`onBulkDelete` — orders are not created/deleted from the grid.

- [ ] **Step 3: Create `useOrdersRealtime`**

Copy `features/customers/ui/hooks/use-customers-realtime.ts` to `features/orders/ui/hooks/use-orders-realtime.ts`, subscribing to `orders` + `order_status_events` instead of `customers` + `addresses`. Same debounce + `router.refresh()`.

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add features/orders/ui/order-grid.tsx features/orders/ui/order-grid-columns.tsx features/orders/ui/hooks/use-orders-realtime.ts
git commit -m "feat(orders): OrderGrid + columns + realtime hook"
```

---

## Task 8: Swap the orders page to the grid

**Files:**
- Modify: `app/(admin)/orders/page.tsx`
- Delete: `features/orders/ui/order-table.tsx`

- [ ] **Step 1: Render `OrderGrid` with views + filters**

Mirror `app/(admin)/customers/page.tsx`: parse `view`/`filter`/`sort`/`order` params, run `listOrders` with them + the date-range preset bounds, fetch views via `listViewsAction("orders")`, apply default-view redirect, and render `ViewTabs` + `OrderGrid` + pagination. Keep `OrderListFilters` (date presets) passed into `OrderGrid` via `toolbarExtra`.

Key change to the `listOrders` call — pass the new params:

```ts
const result = await listOrders({
  status: params.status,
  scheduled_from: presetBounds.from,
  scheduled_to: presetBounds.to,
  sort: params.sort,
  order: params.order,
  page: params.page,
  pageSize: params.pageSize,
  filters: parseFiltersFromQueryParam(params.filter),
});
```

> Import `parseFiltersFromQueryParam` from `@/shared/filter/filter-rule`. Copy the `ViewTabs` + default-view-redirect block from the customers page verbatim, swapping `tableId` to `"orders"` and `basePath` to `/orders`.

- [ ] **Step 2: Delete the static table**

```bash
git rm features/orders/ui/order-table.tsx
```

Remove its import from the page. If `ClickableTableRow` or other helpers were only used by `order-table.tsx`, remove them too (grep first).

- [ ] **Step 3: Typecheck + lint + build**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. Then `pnpm dev` and open `/orders`.

- [ ] **Step 4: Manual smoke test**

Verify on `/orders`:
- Grid renders with virtualization, sortable headers, the filter builder, and date-range presets.
- The customer column links to the right customer.
- Editing `status` offers only legal transitions; choosing "İptal" requires a reason; the change persists and writes a status event (check `/orders/[id]`).
- Editing `payment_status` to "Ödendi" sets `paid_at` (re-open detail to confirm); back to "Bekliyor" clears it.
- Editing `delivery_fee` updates `total` after refresh (generated column).
- Saved views work (create a view, switch tabs).

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/orders/page.tsx"
git commit -m "feat(orders): replace static table with DataGrid + views"
```

---

## Task 9: Customer-detail Orders list (fills Plan 2's `ordersSlot`)

**Files:**
- Create: `features/orders/ui/customer-orders-list.tsx`
- Modify: `features/customers/ui/customer-grid.tsx` (pass the slot)

- [ ] **Step 1: Build a read-only orders list**

A server component (or client with a server-action fetch) that calls `listOrders({ customer_id })` and renders a compact table: `order_number` (link), `status`, `scheduled_for`, `total`, `payment_status`, plus a "Yeni sipariş" link prefilled with the customer.

```tsx
import Link from "next/link";

import { listOrders } from "@/features/orders/application/list-orders";
import { formatTRY } from "@/shared/utils/money";

export async function CustomerOrdersList({ customerId }: { customerId: string }) {
  const result = await listOrders({ customer_id: customerId, pageSize: 100 });
  if (!result.ok) return <p className="text-sm text-destructive">Siparişler yüklenemedi.</p>;
  const orders = result.value.items;
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Siparişler ({orders.length})</h3>
        <Link href={`/orders/new?customer=${customerId}`} className="text-xs underline-offset-2 hover:underline">
          + Yeni sipariş
        </Link>
      </div>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Henüz sipariş yok.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {orders.map((o) => (
            <li key={o.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <Link href={`/orders/${o.id}`} className="font-mono text-xs underline-offset-2 hover:underline">
                {o.order_number}
              </Link>
              <span className="text-muted-foreground">{o.scheduled_for}</span>
              <span>{o.status}</span>
              <span className="font-mono">{formatTRY(o.total_minor)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

> `/orders/new` must accept a `?customer=` prefill — confirm the create-order form reads it; if not, that's a tiny follow-up on the order form (out of this task's strict scope, note it).

- [ ] **Step 2: Pass the slot into the detail panel**

In `customer-grid.tsx`'s `CustomerDetailLoader`/Sheet (from Plan 2 Task 10), pass `ordersSlot={<CustomerOrdersList customerId={openId} />}`. Since `CustomerOrdersList` is async (server component), render it via the route page's panel directly; in the client Sheet, fetch through a server action wrapper or render the orders list inside the `[id]` page (which is server-rendered) and keep the Sheet for quick field edits. **Decision:** include the orders list in the `[id]` route panel (server component) and in the Sheet load it through the same `getCustomerByIdAction` companion that returns the orders too, OR keep the Sheet orders-list as a client list fetched via a `listOrdersByCustomerAction`. Simplest: add a thin `"use server"` `listCustomerOrdersAction(customerId)` returning `OrderListItem[]` and render a client list in the Sheet.

- [ ] **Step 3: Typecheck + lint + smoke**

Run: `pnpm typecheck && pnpm lint`; open a customer with orders in both the `/customers/[id]` page and the grid Sheet — the orders list shows and links resolve.

- [ ] **Step 4: Commit**

```bash
git add features/orders/ui/customer-orders-list.tsx features/customers/ui/customer-grid.tsx "app/(admin)/customers/[id]/page.tsx"
git commit -m "feat(orders): customer-detail orders list (spec §8 #7)"
```

---

## Task 10: On-delete — block customers with orders (test first)

**Files:**
- Modify: `features/customers/application/bulk-delete-customers.ts`
- Create: `features/customers/application/bulk-delete-customers.test.ts` (pure partition helper)

- [ ] **Step 1: Extract + test the partition helper**

Add a pure helper and test it:

```ts
// features/customers/application/bulk-delete-customers.test.ts
import { describe, expect, it } from "vitest";

import { partitionDeletable } from "@/features/customers/application/bulk-delete-customers";

describe("partitionDeletable", () => {
  it("blocks ids that have orders, allows the rest", () => {
    const counts = new Map([["a", 3], ["b", 0]]);
    const { blocked, deletable } = partitionDeletable(["a", "b", "c"], counts);
    expect(blocked).toEqual([{ id: "a", orderCount: 3 }]);
    expect(deletable).toEqual(["b", "c"]);
  });
});
```

```ts
// add to bulk-delete-customers.ts (exported)
export function partitionDeletable(
  ids: ReadonlyArray<string>,
  counts: ReadonlyMap<string, number>,
): { blocked: { id: string; orderCount: number }[]; deletable: string[] } {
  const blocked: { id: string; orderCount: number }[] = [];
  const deletable: string[] = [];
  for (const id of ids) {
    const n = counts.get(id) ?? 0;
    if (n > 0) blocked.push({ id, orderCount: n });
    else deletable.push(id);
  }
  return { blocked, deletable };
}
```

- [ ] **Step 2: Run to verify it fails then passes**

Run: `pnpm vitest run features/customers/application/bulk-delete-customers.test.ts`
Expected: FAIL (not exported) → add the helper → PASS.

- [ ] **Step 3: Wire the pre-check into the action (block-all on any blocked)**

In `bulkDeleteCustomersAction`, after parsing ids and before `repoBulkDelete`:

```ts
import { countOrdersByCustomer } from "@/features/orders/infrastructure/order.repository";
// NOTE: cross-feature read — orders repo is reached via its infrastructure.
// Prefer a thin orders/application export if boundaries lint complains:
// e.g. countOrdersByCustomer re-exported from features/orders/application.

const countsResult = await countOrdersByCustomer(parsed.data);
if (!countsResult.ok) return err(countsResult.error);
const { blocked } = partitionDeletable(parsed.data, countsResult.value);
if (blocked.length > 0) {
  // Need names for the message — snapshot already fetched below; reorder so
  // the snapshot fetch happens first, then build a Turkish message:
  const names = new Map(
    (snapshotResult.ok ? snapshotResult.value : []).map((r) => [r.id, `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "(isimsiz)"]),
  );
  const detail = blocked
    .map((b) => `${names.get(b.id) ?? b.id} (${b.orderCount} sipariş)`)
    .join(", ");
  return err(
    new ValidationError({
      message: `Siparişi olan müşteriler silinemez: ${detail}`,
    }),
  );
}
```

> Move the existing `findListItemsByIds` snapshot fetch above this block so the names are available. The design choice is **all-or-nothing**: if any selected customer has orders, delete nothing and tell the admin which ones. The grid surfaces `result.error.message` via its existing bulk-delete error path (`onCellError`).

> **Boundaries:** CLAUDE.md §2 forbids importing another feature's repository directly. Add `export { countOrdersByCustomer } from "../infrastructure/order.repository";` in a new `features/orders/application/count-orders-by-customer.ts` and import THAT from the customers action. Update the import accordingly.

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean (boundaries plugin happy via the application re-export).

- [ ] **Step 5: Manual smoke**

On `/customers`, select a customer that has orders + one that doesn't → "Sil" → toast: "Siparişi olan müşteriler silinemez: …". Select only order-free customers → they delete.

- [ ] **Step 6: Commit**

```bash
git add features/customers/application/bulk-delete-customers.ts features/customers/application/bulk-delete-customers.test.ts features/orders/application/count-orders-by-customer.ts
git commit -m "feat(customers): block deleting customers that have orders"
```

---

## Task 11: Orders realtime migration (+ payment_status index)

**Files:**
- Create: `supabase/migrations/<ts>_realtime_orders.sql`

- [ ] **Step 1: Create the migration**

```sql
-- Stream order changes to the grid (mirrors the customers realtime setup).
-- RLS still gates broadcast rows. order_status_events included so a status
-- transition (which writes an event) also nudges the grid.
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_status_events;

-- payment_status becomes a grid sort/filter target; index it so sorting a
-- large orders list stays index-backed (CLAUDE.md §1 paranoid-scale).
create index if not exists orders_payment_status_idx on public.orders (payment_status);
```

> Confirm the customers realtime migration's exact `alter publication` syntax and match it. If tables are already in the publication, guard with a `do $$ ... $$` block or accept the error-on-rerun is avoided by `db reset` running clean from scratch.

- [ ] **Step 2: Apply + regen types**

Run: `pnpm supabase db reset` then the type-gen script.
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations shared/supabase/types.ts
git commit -m "feat(db): realtime publication for orders + payment_status index"
```

---

## Self-review notes (already applied)

- Spec Part D: D1 → Tasks 6–8; D-status → Task 6; D2 → Tasks 2–5; D3 → Task 8; D4 → Task 10; D5 → Task 11. §8 #7 (customer detail lists orders) → Task 9.
- Type consistency: `OrderCellPatch`/`OrderCellField`, `orderCellPatchSchemas`, `patchOrderCell`/`patchOrderCellAction`, `findOrderListItemById`, `countOrdersByCustomer`, `orderStatusEditor`, `allowedTransitions`, `partitionDeletable` used consistently.
- Boundaries: cross-feature order count exposed via `features/orders/application/count-orders-by-customer.ts` (Task 10) to satisfy the ESLint `boundaries` rule.
- Generated column safety: `patchOrderCell` never writes `total_minor`; `delivery_fee` write lets the DB recompute it.
- Confirm-against-live notes left for: `formatTRY` path, `created_at` string-vs-Date, `logAudit` action enum (`order.updated`), `Dialog`/`Select`/`Sheet` exports, customers-page view block to copy.

---

## Definition of done

- `pnpm vitest run features/orders` + `features/customers/application/bulk-delete-customers.test.ts` green; `pnpm typecheck` + `pnpm lint` clean.
- `pnpm supabase db reset` applies both new migrations.
- Manual smoke tests (Tasks 8, 9, 10) pass.
- Acceptance criteria §8 #4 (order link resolves), #7 (detail lists orders), #8 (on-delete) satisfied.
