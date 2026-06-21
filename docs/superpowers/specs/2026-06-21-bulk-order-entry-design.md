# Bulk Order Entry — Basket × Customer Matrix (Design)

**Date:** 2026-06-21
**Status:** Approved (pending implementation plan)
**Source:** Owner brainstorming session 2026-06-21
**Feature touched:** `orders` (reads `customers` + `products` via their `application/` layers)

---

## 1. Problem & framing

Today an order is created one customer at a time via `/orders/new` (`features/orders/ui/order-form.tsx`):
pick a customer (typeahead), build items, set date/slot/payment, submit → atomic
`create_order_with_items` RPC → **the order is frozen** (only status/payment change afterwards).

For the real workflow — "the same eggs go to 50 customers on the 23rd, then milk to 10 of
them" — this is brutal: constant navigation between customer lookup and the cart, one order at
a time. The owner timed it at ~40 minutes; the target is **~5 minutes**.

The owner's idea: a split screen — **left = customer list (multi-select), right = a shared
basket** — so common items (date, products) are entered once and pushed to many customers like
a game, with the ability to keep narrowing the selection and amending (add milk to a subset).

### The hard problem this design solves
When you select N customers whose baskets **differ** (the "pekmez problem": 1 of 10 also bought
molasses; or 5 with only chicken + 5 with chicken+milk), what does the shared right panel show?
We reject force-splitting into groups (combinatorial explosion). Instead the panel shows a
**coverage readout** per product over the current selection. Mixed selections become legible at
a glance; nothing is hidden and nothing is accidentally wiped.

### Decisions locked during brainstorming
1. **Interaction model:** Left customer list + right **smart basket panel** with per-product
   **coverage badges**. (Rejected: full customer×product spreadsheet matrix; auto-clustered
   basket cards — the latter survives only as an optional future "group" view.)
2. **Lifecycle:** The whole batch is a **draft in `localStorage`**, keyed by delivery date.
   Nothing hits the DB until commit. The left side accumulates the per-customer assignment
   "records" as you apply.
3. **Commit boundary:** **One bulk commit** at the end → a new atomic `create_orders_bulk`
   RPC. Existing orders stay **frozen-on-create** — no order-mutation work. Editing a
   previously-committed order is *not* this screen's job (use the existing order detail).
4. **Persistence is swappable:** `localStorage` now (single admin, Faz 1) behind a `DraftStore`
   port; a `SupabaseDraftStore` (+ table + RLS) can replace it in Faz 2 (multi-admin) with no
   UI/domain change. Satisfies the paranoid-scale rule (§1) by design, not by overbuilding.
5. **Commit is all-or-nothing** with a safety cap (≤250 orders/commit).
6. **The single-customer flow is subsumed** by the n=1 case; the old `order-form.tsx` is retired.

### Deferred (stated, not built)
- Auto-clustered basket cards ("group view").
- Per-row override of time-slot / payment / delivery-fee (v1 ships batch-level defaults only;
  per-customer delivery notes are the one exception, editable in row detail).
- Multi-date batches (one batch = one delivery date in v1).
- Server-persisted drafts (Faz 2, via the `DraftStore` port).

---

## 2. Data-model contract (from the existing schema)

Unchanged. We reuse the current order shape and only add a bulk-create path.

- **Order** (`features/orders/domain/order.ts`): `customer_id`, `scheduled_for` (date, Europe/
  Istanbul calendar day), `time_slot` (`morning|afternoon|evening|null`), `payment_method`
  (`cash_on_delivery|bank_transfer`), `delivery_notes`, `delivery_address_snapshot` (jsonb,
  frozen from customer's primary address at create), money in **kuruş** (`subtotal_minor`,
  `delivery_fee_minor`, generated `total_minor`).
- **OrderItem**: `product_key`, `quantity numeric(10,2)`, frozen `unit_price_minor`, generated
  `line_total_minor`, `product_snapshot` (display_name/unit/unit_label).
- **Product** (`features/products/domain/product.ts`): keys `eggs|milk|cheese|yogurt` (+ any
  added later), `step` (0.5 for cheese/yogurt, else 1), `min_qty`, `current_unit_price_minor`,
  `price_tiers`. Per-customer price overrides exist and win over tiers.
- **Customer**: `first_name`/`last_name` nullable, `address` **optional** (constraint relaxation,
  2026-06-08). Orders still require an address snapshot → address-less customers need handling
  at commit (§5).

---

## 3. Interaction design (the "game")

### 3.1 Screen anatomy
```
┌─ Sipariş Oluştur ─ Teslim: [ 23 Haz ▾ ]  Saat: [öğleden önce ▾]  Ödeme: [kapıda ▾] ─┐
├──────────────────────────────────┬───────────────────────────────────────────────┤
│  SOL — MÜŞTERİLER (filtre + ara)  │  SAĞ — ORTAK SEPET · 10 müşteri seçili         │
│  ☑ Ayşe K.    🥚3                 │  🥚 Yumurta   ×3      10/10 ✓                  │
│  ☑ Mehmet T.  🥚3 🥛1             │  🥛 Süt       ×1       7/10 ◑   [uygula]       │
│  ☑ Fatma D.   🥚3 🥛1 🧀.5        │  🧀 Peynir    ×.5      1/10 ○                  │
│  ☑ Ali V.     🥚3 🍯1  ⚠adres     │  🍯 Pekmez    ×1       1/10 ○                  │
│  ☑ Zeynep .   🥚3 🥛1  📦var      │  ────────────────────────────────────────     │
│  … (sayfalı, 1000+ müşteri)       │  [ + ürün ekle ▾ ]   → Seçili 10'a uygula      │
│  [tümünü seç (filtreli)]          │  [ seçiliden kaldır ]                          │
├──────────────────────────────────┴───────────────────────────────────────────────┤
│  50 sipariş • ₺2.480 tahmini • ⚠ 2 müşteride adres yok    [ Siparişleri Oluştur ]  │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Coverage badge — exact semantics
For the current selection of *n* customers, each product line shows:
- **`n/n ✓`** — all selected have it at the **same quantity** ("ortak").
- **`n/n ✓ ~`** — all have it but **quantities differ** ("ortak, miktar karışık"); typing one qty
  + uygula normalizes.
- **`k/n ◑`** — only *k* of *n* have it (partial).
- **`1/n ○`** — the pekmez case: one person's extra; visible, never auto-wiped.

This is the answer to the hard problem: a mixed selection is fully legible without splitting.

### 3.3 Edit verbs (only two)
- **`→ uygula`**: set product = typed qty for **every selected customer** (add where missing,
  overwrite where different) → becomes `n/n ✓`.
- **`kaldır`**: remove product from every selected customer.
- Quantity input enforces the product `step` (0.5 for peynir/yoğurt) client-side; server
  re-validates.

### 3.4 Worked scenario (owner's own)
1. Open **Sipariş Oluştur** → pick **23 Haz**. Left grid = customers, empty baskets (`—`).
2. Filter → **tümünü seç (filtreli)** (50). Add **Yumurta ×3** → uygula. Rows show `🥚3`;
   panel `Yumurta 50/50 ✓`.
3. Narrow selection to the 10 who want süt → add **Süt ×1** → uygula. Rows → `🥚3 🥛1`.
4. Select a mixed 10 → panel instantly: `Yumurta 10/10 ✓`, `Süt 7/10 ◑`, `Pekmez 1/10 ○`.
   No splitting, no guessing.
5. Bottom bar pre-flight: `⚠ 2 müşteride adres yok`; rows already having an order for 23 Haz
   carry `📦`. Fix address inline (existing pin corrector) or drop; decide on duplicates.
6. **Siparişleri Oluştur** → atomic create → redirect to `/orders` with a summary → draft cleared.

---

## 4. Technical architecture

### 4.1 Layering (CLAUDE.md §2)
`orders` feature owns the screen. It reads customers/products **only via their `application/`**
exports (no repository reach-in → ESLint `boundaries` stays green). `ui → application → domain`;
infrastructure implements the new RPC.

### 4.2 Domain — pure TS + Zod (the testable heart)
```ts
// features/orders/domain/draft-batch.ts
type BasketLine = { product_key: string; quantity: number };
type DraftBatch = {
  scheduledFor: string;                 // YYYY-MM-DD
  defaults: { timeSlot: TimeSlot | null; paymentMethod: PaymentMethod; deliveryFeeMinor: number };
  assignments: Record<CustomerId, BasketLine[]>;   // "the records on the left"
};
```
Pure functions (each unit-tested, §11):
- `computeCoverage(selectedIds, batch) → CoverageLine[]` — badge logic
  (`state: 'all'|'partial'|'none'`, `commonQty | 'mixed'`). Where pekmez / 5-tavuk are defined.
- Reducers: `applyLine(batch, ids, line)`, `removeLine(batch, ids, key)`,
  `clearCustomers(batch, ids)` — every basket edit is one of these.
- `draft-batch.schema.ts` — single Zod source for both the localStorage parse and the action.

### 4.3 Persistence — localStorage behind a port
- `useDraftBatch()` hook: debounced persist of the active draft under one key; **Zod-parses on
  load** (external boundary) — stale product keys / corrupt JSON → discard gracefully.
- `DraftStore` interface; `LocalStorageDraftStore` now → `SupabaseDraftStore` later (Faz 2),
  same interface, no UI/domain change.

### 4.4 Commit path
**New RPC** `create_orders_bulk(p_orders jsonb, p_created_by uuid) → jsonb`:
- Array of per-customer orders; per element it performs *exactly* the existing
  `create_order_with_items` steps (snapshot primary address — fail if missing; insert order +
  items + initial `pending` status event), reusing that logic.
- **One transaction → all-or-nothing.** Returns `[{customer_id, order_id, order_number}]`.

**New Server Action** `createOrdersBulkAction` (Zod-first → `Result<T,E>` → audit; §3–§6):
1. Auth.
2. Zod-parse the submitted batch.
3. Load active catalog **once** + **batch-fetch per-customer price overrides in one query**
   (no N+1, §9); re-price & re-validate steps/min server-side, freezing `unit_price_minor`.
4. **Pre-flight address check in one query** — customers missing a primary address return as a
   clean `validation_error` list (not a failed transaction). RPC still guards (defense in depth).
5. Call `create_orders_bulk`.
6. **One `order.bulk_created` audit entry** (count, date, total); RPC writes per-order status
   events.
7. `revalidatePath('/orders')`; return `{created, orderNumbers}`.
- **Safety cap** ≤250 orders/commit (logged if exceeded) — conservative default (§1).

### 4.5 Performance / 1000-user notes (§1, §9)
- Left grid stays **paginated** (existing DataGrid, 25/page).
- **"Tümünü seç (filtreli)"** resolves to an **ids-only query** over the active filter — never
  loads all rows.
- Draft holds assignments **only for touched customers** → small regardless of customer count.
- Coverage is computed over the **selected** set only — bounded, fast, pure.

### 4.6 Edge cases
- **Adres yok**: `⚠` row badge + blocked at pre-flight with the exact list (inline fix via
  existing pin corrector, or drop the row).
- **Bu tarihte zaten sipariş var**: `📦` badge (one cheap query for orders on the date);
  commit proceeds unless excluded (duplicates may be intentional).
- **Step rule**: 0.5 for peynir/yoğurt enforced in the panel and re-validated server-side.
- **Empty basket customer**: a selected customer with no lines is skipped at commit (no empty
  order), surfaced in the summary count.

---

## 5. Testing (§11)
- **Domain unit tests:** `computeCoverage` (all / partial / mixed-qty / pekmez), the three
  reducers, step validation, localStorage Zod parse (valid / stale / corrupt).
- **RPC:** atomic bulk insert; rollback when a customer lacks an address (mocked).
- **Pricing:** per-customer override applied correctly within a batch.

---

## 6. Files

**New**
- `features/orders/domain/draft-batch.ts`, `draft-batch.schema.ts`
- `features/orders/domain/__tests__/draft-batch.test.ts`
- `features/orders/ui/bulk-order-screen.tsx`, `basket-panel.tsx`, `coverage-line.tsx`,
  `use-draft-batch.ts` (+ `DraftStore` / `LocalStorageDraftStore`)
- `features/orders/application/create-orders-bulk.ts`
- `supabase/migrations/<ts>_create_orders_bulk.sql`

**Changed**
- `app/(admin)/orders/new/page.tsx` — loads catalog + first customer page, renders bulk screen.
- `features/orders/infrastructure/order.repository.ts` — `createOrdersBulk()` calling the RPC.
- `features/orders/ui/order-form.tsx` — **retired** (n=1 subsumed by the bulk screen).

---

## 7. Done criteria (CLAUDE.md §15)
- [ ] `pnpm typecheck` clean (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes).
- [ ] `pnpm lint` clean (boundaries, no-console).
- [ ] Domain unit tests for coverage + reducers + Zod parse pass (`pnpm test`).
- [ ] Migration runs locally (`supabase db reset`).
- [ ] PR notes the affected feature (orders; reads customers/products).
