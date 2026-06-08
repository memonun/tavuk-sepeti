# CRM Grid — Plan 2: Customers (relaxed constraints, add-row, detail panel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permanently relax customer data-model constraints (nullable name, optional address), turn "+ Yeni satır" into a conventional add-blank-row, de-stub paste-create, and add a click-to-open detail side-panel that carries the full customer form (with map).

**Architecture:** A migration drops `NOT NULL`/relaxes CHECKs on `customers.first_name`/`last_name`; the mapper stops throwing on address-less customers; domain types make name + address nullable. A new `addCustomerRow` repository fn + Server Action backs the add-row footer (new `onAddRow` DataGrid mutation). `bulkCreateCustomers` stops writing placeholder `(0,0)` addresses. The existing `/customers/[id]` form is extracted into a shared `CustomerDetailPanel` rendered both by the route and a `Sheet` opened from the grid.

**Tech Stack:** Next.js 16 App Router, Supabase (supabase-js + SQL migrations), Zod, `@base-ui/react` `Sheet`, Vitest. Prereq: **Plan 1 merged** (uses the shared grid; not strictly required to start but recommended).

**Source design:** `docs/superpowers/specs/2026-06-08-crm-grid-gap-closure-design.md` (Parts B, C). **Memory:** this overrides CLAUDE.md/SPEC §9 by owner decision — see `project_crm_grid_constraint_relaxation`.

---

## File Structure

- Create: `supabase/migrations/<ts>_relax_customer_constraints.sql` — drop NOT NULL + relax CHECK on names.
- Modify: `features/customers/domain/customer.ts` — `first_name`/`last_name`/`address` nullable.
- Modify: `features/customers/domain/customer.schema.ts` — optional name + address; nullable cell patches.
- Modify: `features/customers/infrastructure/customer.mapper.ts` — address-less customers map to `address: null`.
- Modify: `features/customers/infrastructure/customer.repository.ts` — `addCustomerRow`, de-stubbed `bulkCreateCustomers`, address-field patch guard.
- Create: `features/customers/application/add-customer-row.ts` — Server Action for the blank row.
- Modify: `features/customers/ui/customer-grid.tsx` — wire `onAddRow`, panel state, open-on-row.
- Modify: `features/customers/ui/customer-grid-columns.tsx` — name null display; actions opens panel.
- Modify: `components/data-grid/data-grid-types.ts` + `components/data-grid/data-grid.tsx` — add `onAddRow` mutation + footer.
- Create: `features/customers/ui/customer-detail-panel.tsx` — shared detail/edit body.
- Modify: `app/(admin)/customers/[id]/page.tsx` — render the shared panel body.
- Tests: `features/customers/infrastructure/customer.mapper.test.ts`, `features/customers/domain/customer.schema.test.ts`.

---

## Task 1: Migration — relax name constraints

**Files:**
- Create: `supabase/migrations/<timestamp>_relax_customer_constraints.sql`

- [ ] **Step 1: Create the migration**

Pick a timestamp after the latest existing migration (check `ls supabase/migrations`). Name it `<ts>_relax_customer_constraints.sql`:

```sql
-- Relax customer identity constraints to support conventional in-grid
-- "add row": a new customer may start blank and be completed inline or
-- via the detail panel. Address remains app-level optional (no DB change
-- needed — nothing requires an addresses row to exist).
--
-- Owner decision 2026-06-08 (overrides SPEC §9). Completed-customer data
-- quality is now an application concern, not a DB invariant.

alter table public.customers
  alter column first_name drop not null,
  alter column last_name drop not null;

-- Replace the length CHECKs so null is allowed but a present value is
-- still bounded 1..100.
alter table public.customers
  drop constraint if exists customers_first_name_check,
  drop constraint if exists customers_last_name_check;

alter table public.customers
  add constraint customers_first_name_check
    check (first_name is null or length(trim(first_name)) between 1 and 100),
  add constraint customers_last_name_check
    check (last_name is null or length(trim(last_name)) between 1 and 100);
```

> Confirm the exact existing constraint names first: `grep -rn "first_name" supabase/migrations | grep -i check`. If they differ, use the real names in the `drop constraint` lines.

- [ ] **Step 2: Apply locally**

Run: `pnpm supabase db reset` (or the project's `db:reset` script).
Expected: completes without error; the new migration runs last.

- [ ] **Step 3: Regenerate DB types**

Run the project's type-gen script (check `package.json` scripts, e.g. `pnpm db:types`).
Expected: `shared/supabase/types.ts` now types `customers.first_name`/`last_name` as `string | null`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations shared/supabase/types.ts
git commit -m "feat(db): relax customer name constraints for in-grid add-row"
```

---

## Task 2: Domain types — nullable name + address

**Files:**
- Modify: `features/customers/domain/customer.ts`

- [ ] **Step 1: Make name + address nullable on the entity and list item**

In `customer.ts`, change:

```ts
// Customer interface
readonly first_name: string | null;
readonly last_name: string | null;
// ...
readonly address: CustomerAddress | null;
```

```ts
// CustomerListItem interface
readonly first_name: string | null;
readonly last_name: string | null;
```

- [ ] **Step 2: Typecheck (expect downstream errors — fixed in later tasks)**

Run: `pnpm typecheck`
Expected: errors in `customer.mapper.ts`, possibly `customer-grid-columns.tsx`. Note them; they are the next tasks. No new errors inside `customer.ts`.

- [ ] **Step 3: Commit**

```bash
git add features/customers/domain/customer.ts
git commit -m "feat(customers): nullable name + optional address on domain types"
```

---

## Task 3: Mapper — address-less customers (test first)

**Files:**
- Modify: `features/customers/infrastructure/customer.mapper.ts`
- Test: `features/customers/infrastructure/customer.mapper.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// features/customers/infrastructure/customer.mapper.test.ts
import { describe, expect, it } from "vitest";

import { rowToCustomer, rowToListItem } from "@/features/customers/infrastructure/customer.mapper";

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    first_name: null,
    last_name: null,
    email: null,
    phone: null,
    notes: null,
    status: "active",
    account_type: "individual",
    tag: null,
    legacy_segment: null,
    created_at: "2026-06-08T00:00:00.000Z",
    updated_at: "2026-06-08T00:00:00.000Z",
    created_by: null,
    addresses: [],
    ...overrides,
  };
}

describe("rowToCustomer (relaxed)", () => {
  it("returns address: null when the customer has no primary address", () => {
    const customer = rowToCustomer(baseRow() as never);
    expect(customer.address).toBeNull();
    expect(customer.first_name).toBeNull();
  });
});

describe("rowToListItem (relaxed)", () => {
  it("maps null names + missing city without throwing", () => {
    const item = rowToListItem({
      id: "1",
      first_name: null,
      last_name: null,
      phone: null,
      email: null,
      status: "active",
      account_type: null,
      tag: null,
      legacy_segment: null,
      created_at: "2026-06-08T00:00:00.000Z",
      addresses: [],
    } as never);
    expect(item.first_name).toBeNull();
    expect(item.city).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run features/customers/infrastructure/customer.mapper.test.ts`
Expected: FAIL — `rowToCustomer` throws "has no primary address".

- [ ] **Step 3: Update the mapper**

In `customer.mapper.ts`, replace the throw in `rowToCustomer`:

```ts
export function rowToCustomer(row: CustomerWithAddressRow): Customer {
  const primary = row.addresses.find((a) => a.is_primary);
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    status: row.status as CustomerStatus,
    account_type: asAccountType(row.account_type),
    tag: row.tag,
    legacy_segment: row.legacy_segment,
    address: primary ? rowToAddress(primary) : null,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    created_by: row.created_by,
  };
}
```

Update `ListProjectionRow.first_name`/`last_name` to `string | null` and ensure `rowToListItem` passes them through unchanged (already does).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run features/customers/infrastructure/customer.mapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/customers/infrastructure/customer.mapper.ts features/customers/infrastructure/customer.mapper.test.ts
git commit -m "feat(customers): map address-less customers to address:null"
```

---

## Task 4: Schemas — optional name + address (test first)

**Files:**
- Modify: `features/customers/domain/customer.schema.ts`
- Test: `features/customers/domain/customer.schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// features/customers/domain/customer.schema.test.ts
import { describe, expect, it } from "vitest";

import {
  customerCellPatchSchema,
  customerFormSchema,
} from "@/features/customers/domain/customer.schema";

describe("customerFormSchema (relaxed)", () => {
  it("accepts a blank-ish customer with no name and no address", () => {
    const parsed = customerFormSchema.safeParse({ status: "active" });
    expect(parsed.success).toBe(true);
  });
});

describe("customerCellPatchSchema (relaxed names)", () => {
  it("accepts clearing first_name to null", () => {
    const parsed = customerCellPatchSchema.safeParse({ field: "first_name", value: "" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.value).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run features/customers/domain/customer.schema.test.ts`
Expected: FAIL — form requires `first_name`/`last_name`/`address`; cell patch rejects empty name.

- [ ] **Step 3: Update the schemas**

In `customer.schema.ts`:

Make name fields and address optional/nullable in `customerFormSchema`:

```ts
const nullableName = (label: string) =>
  z.preprocess(
    blankToNull,
    z.string().trim().min(1, label).max(100, "En fazla 100 karakter olabilir.").nullable(),
  );

export const customerFormSchema = z.object({
  first_name: nullableName("Ad gerekli.").default(null),
  last_name: nullableName("Soyad gerekli.").default(null),
  email: emailOrNull,
  phone: z.preprocess(blankToNull, phoneTR.nullable()).default(null),
  notes: notesOrNull,
  status: z.enum(["active", "inactive", "blocked"]).default("active"),
  address: z
    .object({
      city: optionalShortText(100),
      district: optionalShortText(100),
      neighborhood: optionalShortText(100),
      street: optionalShortText(150),
      building_no: optionalShortText(20),
      apartment_no: optionalShortText(20),
      postal_code: optionalShortText(10),
      description: optionalShortText(500),
      ...latLngSchema.partial().shape,
      source: coordinateSourceSchema.optional(),
      accuracy: coordinateAccuracySchema.optional(),
    })
    .nullable()
    .optional(),
});
```

> Note: `phoneTR` currently can't be wrapped `.nullable()` directly because it's a transform chain. If TS complains, define a `phoneTROrNull` variant mirroring the `bulkCreateCustomerRowSchema.phone` preprocess (which already returns `null` for blank) and use it here and in the cell patch.

In `customerCellPatchSchemas`, relax names to nullable:

```ts
first_name: optionalShortText(100),
last_name: optionalShortText(100),
```

> `optionalShortText` already maps blank → null and bounds length. The discriminated-union entries reference `customerCellPatchSchemas.first_name`/`.last_name`, so they update automatically.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run features/customers/domain/customer.schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: form-consumer types (e.g. `CustomerForm`) may now allow nulls; fix any obvious type mismatches in `customer-form.tsx` (coerce null→"" for inputs as the existing detail page already does). Commit those small fixes with this task.

- [ ] **Step 6: Commit**

```bash
git add features/customers/domain/customer.schema.ts features/customers/domain/customer.schema.test.ts features/customers/ui/customer-form.tsx
git commit -m "feat(customers): optional name + address in form and cell schemas"
```

---

## Task 5: Repository — `addCustomerRow` + de-stub paste + address-patch guard

**Files:**
- Modify: `features/customers/infrastructure/customer.repository.ts`

- [ ] **Step 1: Add `addCustomerRow`**

Append a new exported function (mirror the `createCustomer` insert style, but minimal):

```ts
/**
 * Insert a blank customer for the grid's "+ Yeni satır" add-row. No
 * address row is created — the admin completes it inline or via the
 * detail panel (where the map sets a real pin). Returns the new row in
 * list-item projection so the grid can append it optimistically.
 */
export async function addCustomerRow(
  createdBy: string,
): Promise<Result<CustomerListItem, ExternalApiError>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({ created_by: createdBy })
    .select(
      "id, first_name, last_name, phone, email, status, account_type, tag, legacy_segment, created_at, addresses(city, is_primary)",
    )
    .single();
  if (error || !data) {
    logger.error({ code: error?.code }, "add_customer_row_failed");
    return err(new ExternalApiError({ message: error?.message ?? "Insert failed.", cause: error }));
  }
  return ok(rowToListItem({ ...data, addresses: data.addresses ?? [] } as never));
}
```

> Confirm the server-client factory + `ExternalApiError`/`Result` imports match how `createCustomer` does it at the top of this file. `status`/`account_type` use DB defaults (`active`/`individual`).

- [ ] **Step 2: De-stub `bulkCreateCustomers`**

In `bulkCreateCustomers`, **delete** the placeholder-address block (the section building `addressPayload` with `lat: 0, lng: 0, accuracy: "unknown"` and inserting into `addresses`, plus its rollback). Keep the customer insert + the refetch-by-ids projection. The function now inserts customers only; address stays null until completed.

> After removing the address insert, also remove the now-unused rollback branch tied to `addressError`. Re-read the function end-to-end to ensure the happy path returns `ok(rows)` and the customer-insert error path is intact.

- [ ] **Step 3: Guard address-field patches when no primary address exists**

In `patchCustomerCell`, the branch that routes `city`/`district`/`neighborhood` to the `addresses` table must handle the no-address case. Before updating, check for a primary address; if none, return a clear error instead of creating a fake one:

```ts
// inside patchCustomerCell, address-field branch:
const { data: primary } = await supabase
  .from("addresses")
  .select("id")
  .eq("customer_id", customerId)
  .eq("is_primary", true)
  .maybeSingle();
if (!primary) {
  return err(
    new ValidationError({
      message: "Önce müşteri detayından (harita) adres ekleyin.",
    }),
  );
}
// ...then UPDATE addresses by primary.id as before...
```

> Import `ValidationError` if not already. This makes the grid show a toast + roll back when an admin tries to type a city onto an address-less customer; the real address is set in the detail panel map.

- [ ] **Step 4: Typecheck + targeted test of the repo is integration-only**

Run: `pnpm typecheck`
Expected: clean. (Repository fns hit Supabase; they're covered by the mapper/schema unit tests + manual smoke later.)

- [ ] **Step 5: Commit**

```bash
git add features/customers/infrastructure/customer.repository.ts
git commit -m "feat(customers): addCustomerRow, de-stub paste, guard address patches"
```

---

## Task 6: `add-customer-row` Server Action

**Files:**
- Create: `features/customers/application/add-customer-row.ts`

- [ ] **Step 1: Write the action**

```ts
"use server";

/**
 * Adds a blank customer row for the grid's "+ Yeni satır" footer. The
 * admin completes it inline or via the detail panel. One audit row marks
 * who created the placeholder; no PII exists yet to redact.
 */
import { revalidatePath } from "next/cache";

import { addCustomerRow as repoAddRow } from "@/features/customers/infrastructure/customer.repository";
import { assertAdmin } from "@/features/auth/application/assert-admin";
import { logAudit } from "@/shared/audit/log-audit";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

import type { CustomerListItem } from "@/features/customers/domain/customer";
import type { AppError } from "@/shared/errors/app-error";

export async function addCustomerRowAction(): Promise<Result<CustomerListItem, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);
  const user = auth.value;

  const result = await repoAddRow(user.id);
  if (!result.ok) {
    logger.error({ code: result.error.code }, "add_customer_row_action_failed");
    return err(result.error);
  }

  await logAudit({
    actor_id: user.id,
    action: "customer.created",
    entity_type: "customer",
    entity_id: result.value.id,
    before: null,
    after: { source: "data_grid_add_row" },
    metadata: { source: "data_grid_add_row" },
  });

  revalidatePath("/customers");
  return ok(result.value);
}
```

> Confirm `logAudit`'s `action` enum accepts `"customer.created"` (it does — used by bulk create). If the `after`/`metadata` shape is stricter, match the existing `logAudit` signature.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add features/customers/application/add-customer-row.ts
git commit -m "feat(customers): add-customer-row server action"
```

---

## Task 7: DataGrid — `onAddRow` mutation + footer

**Files:**
- Modify: `components/data-grid/data-grid-types.ts`
- Modify: `components/data-grid/data-grid.tsx`

- [ ] **Step 1: Extend the mutations contract**

In `data-grid-types.ts`, add to `DataGridMutations`:

```ts
  /**
   * Optional. When provided, the "+ Yeni satır" footer appends a blank
   * row via this action and returns the created row so the grid can show
   * it immediately.
   */
  onAddRow?: () => Promise<Result<TRow, AppError>>;
```

- [ ] **Step 2: Rewire the footer**

In `data-grid.tsx`, the footer currently renders when `mutations?.onBulkCreate` and calls `setBulkInputOpen(true)`. Change the condition and handler to prefer add-row:

```tsx
{mutations?.onAddRow ? (
  <tr className="group">
    <td
      colSpan={colCount}
      className="h-8 cursor-pointer border-b border-border px-3 text-left text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      onClick={() => {
        void (async () => {
          const result = await mutations.onAddRow!();
          if (!result.ok) onCellError?.(result.error.message, result.error);
          else onCellSuccess?.();
        })();
      }}
    >
      <span className="inline-flex items-center gap-1.5">
        <Plus className="h-3 w-3" />
        Yeni satır
      </span>
    </td>
  </tr>
) : null}
```

> Paste-create stays available via Ctrl+V (the bulk paste dialog is still wired to `onBulkCreate`); the footer no longer opens it. Confirm `onCellSuccess` exists (used elsewhere ~line 349); if the grid refreshes via realtime/router, calling it triggers the refetch that shows the new row canonically.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add components/data-grid/data-grid-types.ts components/data-grid/data-grid.tsx
git commit -m "feat(data-grid): conventional add-row footer via onAddRow"
```

---

## Task 8: Customer columns — null-name display

**Files:**
- Modify: `features/customers/ui/customer-grid-columns.tsx`

- [ ] **Step 1: Render a placeholder for null names**

Add explicit `cell` renderers for `first_name`/`last_name` so a blank new row reads cleanly:

```tsx
cell: ({ getValue }) => {
  const v = getValue() as string | null;
  return v ? <span>{v}</span> : <span className="text-muted-foreground">—</span>;
},
```

Add to both the `first_name` and `last_name` column defs.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean (the `string | null` editor casts already exist via `as unknown as z.ZodType<string | null>`).

- [ ] **Step 3: Commit**

```bash
git add features/customers/ui/customer-grid-columns.tsx
git commit -m "feat(customers): render placeholder for null name cells"
```

---

## Task 9: Extract `CustomerDetailPanel` (shared body)

**Files:**
- Create: `features/customers/ui/customer-detail-panel.tsx`
- Modify: `app/(admin)/customers/[id]/page.tsx`

- [ ] **Step 1: Create the shared panel body**

Extract the form/map content currently inlined in `[id]/page.tsx` into a client component that takes a `Customer` + the maps key. (Read the current `[id]/page.tsx` to copy the exact `CustomerForm` props + the `defaultValues` mapping — coerce nulls to `""` for inputs as it already does.)

```tsx
"use client";

import { CustomerForm } from "@/features/customers/ui/customer-form";
import type { Customer } from "@/features/customers/domain/customer";
import type { CustomerFormInput } from "@/features/customers/domain/customer.schema";

interface CustomerDetailPanelProps {
  readonly customer: Customer;
  readonly mapsKey: string;
  /** Slot for the customer's orders list (filled by Plan 3). */
  readonly ordersSlot?: React.ReactNode;
}

export function CustomerDetailPanel({ customer, mapsKey, ordersSlot }: CustomerDetailPanelProps) {
  const defaultValues: CustomerFormInput = {
    first_name: customer.first_name ?? "",
    last_name: customer.last_name ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    notes: customer.notes ?? "",
    status: customer.status,
    address: customer.address
      ? {
          city: customer.address.city ?? "",
          district: customer.address.district ?? "",
          neighborhood: customer.address.neighborhood ?? "",
          street: customer.address.street ?? "",
          building_no: customer.address.building_no ?? "",
          apartment_no: customer.address.apartment_no ?? "",
          postal_code: customer.address.postal_code ?? "",
          description: customer.address.description ?? "",
          lat: customer.address.coordinate.lat,
          lng: customer.address.coordinate.lng,
          source: customer.address.coordinate.source,
          accuracy: customer.address.coordinate.accuracy,
        }
      : null,
  };

  return (
    <div className="space-y-6">
      <CustomerForm customerId={customer.id} mapsKey={mapsKey} defaultValues={defaultValues} />
      {ordersSlot}
    </div>
  );
}
```

> Match `CustomerForm`'s real prop names from the live file. The address block must tolerate `null` (a brand-new row has no pin yet — the map starts empty and the admin drops a pin to geocode).

- [ ] **Step 2: Use the panel from the route page**

In `[id]/page.tsx`, replace the inlined `<CustomerForm .../>` with `<CustomerDetailPanel customer={customer} mapsKey={mapsKey} />`. Keep the maps-key guard.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add features/customers/ui/customer-detail-panel.tsx "app/(admin)/customers/[id]/page.tsx"
git commit -m "refactor(customers): extract shared CustomerDetailPanel"
```

---

## Task 10: Open the detail panel from the grid (Sheet)

**Files:**
- Modify: `features/customers/ui/customer-grid.tsx`
- Modify: `features/customers/ui/customer-grid-columns.tsx`

- [ ] **Step 1: Pass an open-detail callback into the columns**

Change `buildCustomerColumns()` to accept `onOpenDetail: (id: string) => void` and make the `actions` cell call it instead of (or in addition to) the `Link`:

```tsx
export function buildCustomerColumns(
  onOpenDetail: (id: string) => void,
): DataGridColumn<CustomerListItem>[] {
  // ...
  // actions column:
  cell: ({ row }) => (
    <button
      type="button"
      onClick={() => onOpenDetail(row.original.id)}
      className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      aria-label="Müşteri detayını aç"
    >
      Aç
    </button>
  ),
}
```

- [ ] **Step 2: Manage panel state + fetch in `CustomerGrid`**

In `customer-grid.tsx`:
- add state `const [openId, setOpenId] = useState<string | null>(null)`;
- `const columns = useMemo(() => buildCustomerColumns(setOpenId), [])`;
- render a `Sheet` (from `components/ui/sheet.tsx`) controlled by `openId != null`. On open, fetch the full customer via the existing `getCustomerById` application fn (call a Server Action wrapper or a client fetch route). Render `<CustomerDetailPanel customer={customer} mapsKey={mapsKey} ordersSlot={<CustomerOrdersList customerId={openId} />} />` once loaded.

```tsx
import { Sheet, SheetContent } from "@/components/ui/sheet";
// ...
<Sheet open={openId !== null} onOpenChange={(o) => !o && setOpenId(null)}>
  <SheetContent side="right" className="w-full max-w-2xl overflow-y-auto">
    {openId ? <CustomerDetailLoader id={openId} /> : null}
  </SheetContent>
</Sheet>
```

> `mapsKey` must reach the client grid — pass `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` down as a prop from the server page (it's a public env var). `CustomerDetailLoader` is a small client component that fetches the customer (via a thin `getCustomerByIdAction` "use server" wrapper around the existing `getCustomerById`) and renders `CustomerDetailPanel` + a loading skeleton. `CustomerOrdersList` is provided by **Plan 3** — until then pass `ordersSlot={undefined}`.

> Confirm the `Sheet`/`SheetContent` exports + props against `components/ui/sheet.tsx` (it wraps `@base-ui/react`). Adjust prop names (`open`/`onOpenChange`/`side`) to match.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Manual smoke test**

Run: `pnpm dev`, open `/customers`. Verify:
- "+ Yeni satır" appends a blank row (em-dash name cells); it persists across reload.
- Clicking "Aç" opens a right-side Sheet with the full form + map; dropping a pin + saving sets the address; closing returns to the grid.
- Typing a city into an address-less row shows the "Önce detaydan adres ekleyin" toast and rolls back.
- Pasting rows (Ctrl+V) still creates customers, now with no fake city/pin.

- [ ] **Step 5: Commit**

```bash
git add features/customers/ui/customer-grid.tsx features/customers/ui/customer-grid-columns.tsx
git commit -m "feat(customers): open detail panel in a Sheet from the grid"
```

---

## Self-review notes (already applied)

- Spec Part B: B1 → Task 1; B2 → Tasks 2–4; B3 → Tasks 5–7; B4 → Task 5 Step 2. Part C → Tasks 9–10.
- Type consistency: `addCustomerRowAction`, `addCustomerRow`, `onAddRow`, `CustomerDetailPanel`, `onOpenDetail` used consistently across tasks.
- `phoneTR` nullability caveat called out in Task 4 (define `phoneTROrNull` if the transform won't take `.nullable()`).
- The orders-list slot in the detail panel is explicitly deferred to Plan 3 (cross-plan dependency noted).
- No placeholders; SQL + TS shown in full for new artifacts; edits anchored to real line regions with "confirm against live file" notes where the file is large.

---

## Definition of done

- `pnpm vitest run features/customers` green; `pnpm typecheck` + `pnpm lint` clean.
- `pnpm supabase db reset` applies the migration cleanly.
- Manual smoke test (Task 10 Step 4) passes.
