# CRM Grid — Gap-Closure for Clients & Orders (Design)

**Date:** 2026-06-08
**Status:** Approved (pending implementation plan)
**Source spec:** `crm-grid-spec.md` (repo root)

---

## 1. Context & framing

The source spec assumes the Clients (Müşteriler) table is "basic and static" and asks to
replace it with a Notion/Excel-like grid. **That premise is outdated.** The current Clients
table is already a full in-house `DataGrid` (`components/data-grid/`) with cell selection,
typed inline editing, copy/paste-to-create, virtualization, column resize/reorder/pin,
sort/filter/group, saved views, realtime, and bulk delete.

This design therefore scopes the **actual remaining gaps** against the spec's acceptance
criteria (§8), plus two deliberate product changes the owner requested during brainstorming
(relaxed customer constraints + conventional add-row + a detail side-panel).

### Decisions locked during brainstorming
1. **Grid technology (settles spec §7):** extend the existing in-house `DataGrid`. React 19
   rules out Glide; a third-party grid would regress working functionality. **No new grid dependency.**
2. **Scope:** full gap-closure of spec §8.
3. **On-delete (spec §3.3 / §10.2):** keep FK `ON DELETE RESTRICT`; block deletion of a
   customer with orders and show a clear message with the order count.
4. **Edit model (spec §6 / §10.3):** keep the existing optimistic + rollback updates with
   realtime reconcile; last-write-wins on conflict.
5. **Orders editability (spec fork):** read-rich grid + a *safe* inline-edit set; order
   creation and item/line editing stay in the dedicated order form.
6. **Customer data-model constraints:** **permanently relaxed** — new rows may have null/empty
   fields and no address. (Overrides spec §9 "no schema changes" — owner-approved.)
7. **Add-row:** "+ Yeni satır" becomes a conventional add-blank-row, not the bulk/paste path.
8. **Detail surface:** clicking a grid row opens a side-panel popup carrying the **full**
   detail-page functionality (form + map + that client's Orders); the `/customers/[id]` route
   is kept and shares the same component.

### Deferred (stated, not built)
- Kanban / Calendar views (spec §4.5, phase 2).
- "Add N empty rows" — superseded by conventional add-row + paste.
- Performance target 10k+ rows — already met by existing virtualization.

---

## 2. Current-state gap analysis (vs spec §8)

| Spec acceptance criterion | Status before this work |
|---|---|
| Single + drag-range cell selection | ✅ `use-cell-selection.ts` |
| Disjoint multi-range (Cmd/Ctrl-click) | ❌ explicitly stubbed "not implemented in Faz 1" |
| Fill handle (drag to copy/extend) | ❌ absent |
| Copy/paste TSV ↔ Excel | ✅ |
| Paste beyond rows → auto-create | ✅ (but stubbed placeholder addresses — to be fixed) |
| Add rows directly | ⚠️ "+ Yeni satır" currently opens the paste dialog, not a real add-row |
| Typed editors + inline validation | ✅ |
| Virtualization at scale | ✅ |
| Resize/reorder/pin, sort/filter/group, views, realtime | ✅ (Customers only) |
| Order→Client relation + link column | ❌ Orders is a plain static `<Table>` |
| Client detail lists its Orders | ❌ detail page is edit-form only |
| On-delete behavior enforced in UX | ⚠️ DB `RESTRICT` exists; UX doesn't surface the block |

---

## 3. Data-model contract (from the existing schema)

### 3.1 Entities
- **Customers** — table `customers` (+ `addresses`, one primary per customer, currently required).
- **Orders** — table `orders` (+ `order_items`, `order_status_events`).

### 3.2 Relationship
- One Customer has many Orders. Link: `orders.customer_id` → `customers.id`, **`ON DELETE RESTRICT`**.
- `addresses.customer_id` → `customers.id`, `ON DELETE CASCADE`.

### 3.3 Enums (verbatim, from `migrations/...0002_create_enums.sql`)
- `customer_status`: `active | inactive | blocked`
- `order_status`: `pending | confirmed | delivered | cancelled`
- `payment_method`: `cash_on_delivery | bank_transfer`
- `payment_status`: `pending | paid | failed | refunded`
- `time_slot`: `morning | afternoon | evening`
- `account_type` (CHECK): `individual | business | charity | bazaar_vendor`

### 3.4 Money & dates
- Money in **minor units (kuruş)** as `bigint`; `orders.total_minor` is a **generated** column
  (`subtotal_minor + delivery_fee_minor`). Never write `total_minor`.
- `scheduled_for` is a `date` (Europe/Istanbul calendar day); timestamps are `timestamptz`.

### 3.5 Order status state machine (`features/orders/domain/order-state-machine.ts`)
```
pending   → confirmed | cancelled
confirmed → delivered | cancelled
delivered → (terminal)
cancelled → (terminal)
cancellation requires a non-empty reason (1–1000 chars)
```
Transitions persist via the `transition_order_status` RPC (writes an audit `order_status_events` row).

---

## 4. Part A — Shared `DataGrid` polish

### A1. Disjoint multi-range selection
`components/data-grid/hooks/use-cell-selection.ts` currently stores a single
`{ anchor, focus }` rectangle. Upgrade to a multi-range model:

- State: `{ ranges: CellRange[]; active: CellAddress }`.
- **Click** → replace with a single range `{anchor, focus}` = clicked cell; set active.
- **Shift+Click / Shift+Arrows** → extend the *active* (last) range's focus.
- **Cmd/Ctrl+Click** → push a new range and make it active.
- `isSelected(cell)` → true if the cell is inside **any** range.
- `activeCell` → the active range's focus.
- **Delete/Backspace** → clears editable cells across **all** ranges.
- **Copy (Ctrl/Cmd+C)** → serializes the **active range only** as a single TSV block
  (matches Sheets/Excel, which refuse to copy ragged multi-areas). Multi-range exists for
  bulk clear and fill, not for copy.

Touched: `use-cell-selection.ts`, `data-grid.tsx` (mouse handlers, render), `use-clipboard.ts`.

### A2. Fill handle
- Render a small square at the bottom-right corner of the **active range**.
- On drag (down and/or right per spec §4.2), preview the target rectangle; on release, **tile**
  the source values across the target:
  - single source cell → repeat the value;
  - multi-cell source → Excel-style tiling/repeat along the drag axis.
- Skip readonly columns (no-op, no error). Validate each written cell with its column's Zod
  schema; invalid values are rejected inline and not committed.
- Commit as a **batched optimistic** patch via the existing `onCellCommit` path.
- Tiling logic extracted to a pure, unit-tested helper (e.g. `components/data-grid/fill.ts`).

Touched: `data-grid.tsx`, new `fill.ts`, reuse clipboard/patch-building + validation.

---

## 5. Part B — Customer schema relaxation + conventional add-row

### B1. Migration (new)
- `ALTER TABLE customers ALTER COLUMN first_name DROP NOT NULL;` (same for `last_name`).
- Relax the length CHECKs to allow null:
  `first_name is null or length(trim(first_name)) between 1 and 100` (same for `last_name`).
- A customer **no longer requires a primary address** (0 or 1). No change to the `addresses`
  table itself (an address row, *if present*, still needs `lat`/`lng`/`raw_text`); the partial
  unique index `addresses_one_primary_per_customer` still holds for 0-or-1 primary.
- No other column changes; RLS unchanged.

### B2. Domain / schema / mapper
- `Customer.first_name: string | null`, `Customer.last_name: string | null`,
  `Customer.address: CustomerAddress | null`.
- `CustomerListItem` first/last name nullable; `city` already nullable.
- `customer.mapper.ts` `rowToCustomer`: return `address: null` when no primary address exists
  (instead of throwing).
- `customerFormSchema`: make name fields and the entire `address` block **optional**.
- `customerCellPatchSchemas`: allow null/empty for `first_name`/`last_name`; address-field
  patches already supported.

### B3. Conventional add-row
- New repository fn `addCustomerRow(createdBy)` → inserts a blank customer (null name, no
  address, `status` default `active`), returns its `CustomerListItem`.
- New application action `add-customer-row.ts` (`assertAdmin`, audit log, `revalidatePath`).
- `DataGrid` gains an `onAddRow` mutation; the "+ Yeni satır" footer is rewired from
  `setBulkInputOpen(true)` to `onAddRow` → optimistic blank row appended → user edits inline
  or opens the side-panel.

### B4. Paste create (de-stub)
- `bulkCreateCustomers` removes the placeholder `(0,0, accuracy=unknown)` address logic.
  Pasted rows insert with their provided columns + null for the rest (no fake coordinates),
  now that the schema permits address-less customers. Paste-overwrite is unchanged.

---

## 6. Part C — Customer detail side-panel

- Extract the current detail/edit content (`CustomerForm` + Google map / geocoding) from
  `app/(admin)/customers/[id]/page.tsx` into a **shared component** (e.g.
  `features/customers/ui/customer-detail-panel.tsx`).
- Clicking a grid row opens this component inside a **`Sheet`** side-panel
  (`components/ui/sheet.tsx`) with **full functionality**:
  - all customer fields;
  - the **map** — the place where an address/pin is created or corrected (honors CLAUDE.md §8:
    a real pin is set here; no silent `approximate` auto-save);
  - that client's **Orders** listed inline (read-only, link to each order, "Yeni sipariş"
    prefilled with the customer) — satisfies spec §8 #7.
- `/customers/[id]` route is **kept**, rendering the same shared component (deep-link/SSR).
- Order data for the panel: `listOrders({ customer_id })` (see D2).

---

## 7. Part D — Orders grid + relations

### D1. `OrderGrid`
New `features/orders/ui/order-grid.tsx` + `order-grid-columns.tsx`, mirroring the customer
grid: shared `DataGrid`, saved views with `tableId: "orders"`, filter builder, realtime on
`orders` + `order_status_events`, pagination, optimistic rows.

Columns:
- **Readonly:** `order_number` (→ detail), **`customer` (link: resolves name with a null-name
  fallback such as phone/`(isimsiz)`, links to `/customers/[id]`; no reassignment)**,
  `total` (TRY via `formatTRY`), `created_at`.
- **Inline-editable (safe set):**
  - `status` — state-machine editor (D-status below);
  - `payment_status` — sets `paid_at = now()` when → `paid`, clears it otherwise;
  - `scheduled_for` — date editor;
  - `time_slot` — select (`morning|afternoon|evening` + empty);
  - `delivery_notes` — text;
  - `delivery_fee` — currency; `total_minor` auto-recomputes via the DB generated column.
- **No paste-create, no add-row** for Orders. Order creation stays in the dedicated form
  (handles items, pricing, snapshots, RPC). Guard: an order requires a delivery address
  snapshot; if the customer has no address, it is entered at order time in the form.

### D-status. State-machine-aware status editor
- Options computed from `allowedTransitions(currentStatus)` so only legal next states show.
- Selecting `cancelled` opens a small **required-reason dialog**.
- Commit routes to the existing `transitionOrder` application service (state validation +
  `transition_order_status` RPC + audit event).

### D2. Orders application / infrastructure
- `order.schema.ts`: add `orderCellPatchSchema` (discriminated union over the safe fields).
- `patch-order-cell.ts` (server action): `assertAdmin`, Zod re-parse; routes
  `status → transitionOrder`, `payment_status → update + paid_at consistency + audit`, plain
  fields → direct update + audit; returns a fresh `OrderListItem`; `revalidatePath("/orders")`.
- `order.repository.ts`: add `patchOrderCell` (direct-update path for plain fields) and
  `findListItemById`. Extend `OrderListItem` + `rowToListItem` + the `listOrders` select to
  include `delivery_notes` and `delivery_fee_minor`.
- `orderListQuerySchema`: add `sort` / `order`, `filters` (FilterRuleList), and `customer_id`
  (for the detail panel). Statuses/payment-statuses are enums → no `getFilterOptions` fetch.

### D3. Orders route swap
- `app/(admin)/orders/page.tsx`: replace static `OrderTable` with `OrderGrid` + `ViewTabs` +
  pagination + default-view redirect (mirrors the customers page). Keep the date-range presets
  in the toolbar; the filter builder handles the rest. `OrderTable` is removed.

### D4. On-delete (block + message)
- Keep FK `ON DELETE RESTRICT`.
- `bulkDeleteCustomersAction` pre-checks order counts for the selected ids; if **any** selected
  customer has orders, it deletes **nothing** and returns a structured error. The grid shows a
  toast listing the blocked customers with counts (e.g. *"Ali Veli (3 sipariş) silinemez"*).

### D5. Realtime migration (new)
- Add `orders` and `order_status_events` to the `supabase_realtime` publication (mirrors the
  existing customers realtime migration).

---

## 8. Cross-cutting requirements (per CLAUDE.md)

- Every Server Action's first line is a Zod parse; external boundaries parsed before use.
- `Result<T, E>` over try/catch; errors extend `AppError` with a `code`; API responses use the
  error envelope; nothing swallowed — every caught error is logged with a correlation id.
- `logger` only (no `console`); structured logs; PII (name/phone/email/address) redacted in
  audit logs via central redact paths.
- Optimistic + rollback edits reconciled by Supabase Realtime; last-write-wins.
- `timestamptz` + minor-units respected; RLS on every table, unchanged.
- Feature-first layering (ui → application → domain; infrastructure implements domain);
  cross-feature access only via `application/`. The Orders work reuses shared `DataGrid`,
  `views`, and `shared/filter` rather than reaching into the customers feature.

---

## 9. Testing (domain/unit, per CLAUDE.md §11)

- `use-cell-selection` multi-range: add range, extend active, membership across ranges, clear.
- Fill-handle tiling helper: single & multi-source, down/right, readonly skip, validation reject.
- Relaxed `customerFormSchema` + `customerCellPatchSchemas`: null/empty name and absent address parse.
- `rowToCustomer`: null address path (no throw).
- `orderCellPatchSchema` parse + `payment_status`/`paid_at` consistency rule.
- Status-editor option computation against `order-state-machine` (reuse existing transitions).
- On-delete partitioning: blocked vs deletable given order counts.
- `rowToListItem` for the new `OrderListItem` fields (`delivery_notes`, `delivery_fee_minor`).

---

## 10. Definition of done (per CLAUDE.md §15)

- `pnpm typecheck` clean, `pnpm lint` clean, `pnpm test` green.
- New migrations run via `supabase db reset` locally.
- PR description lists affected features (`data-grid`, `customers`, `orders`, `views`).
- Acceptance criteria §8 satisfied except the explicitly deferred items (§1).

---

## 11. Affected files (non-exhaustive)

**Shared grid:** `components/data-grid/data-grid.tsx`, `hooks/use-cell-selection.ts`,
`hooks/use-clipboard.ts`, new `components/data-grid/fill.ts`.

**Customers:** `features/customers/domain/customer.ts`, `domain/customer.schema.ts`,
`infrastructure/customer.mapper.ts`, `infrastructure/customer.repository.ts`,
`application/add-customer-row.ts` (new), `application/bulk-create-customers.ts`,
`application/bulk-delete-customers.ts`, `ui/customer-grid.tsx`, `ui/customer-grid-columns.tsx`,
new `ui/customer-detail-panel.tsx`, `app/(admin)/customers/page.tsx`,
`app/(admin)/customers/[id]/page.tsx`.

**Orders:** `features/orders/domain/order.schema.ts`, `domain/order.ts`,
`infrastructure/order.repository.ts`, `infrastructure/order.mapper.ts`,
`application/patch-order-cell.ts` (new), `application/list-orders.ts`,
new `ui/order-grid.tsx`, `ui/order-grid-columns.tsx`, `app/(admin)/orders/page.tsx`
(remove `ui/order-table.tsx`).

**Migrations:** relax `customers` name constraints; add `orders` + `order_status_events` to
the realtime publication.
