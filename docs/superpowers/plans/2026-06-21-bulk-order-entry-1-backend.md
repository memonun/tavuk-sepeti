# Bulk Order Entry — Backend (create_orders_bulk) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an atomic, single-commit path that creates N orders (one per selected customer) for one delivery date, re-pricing each line server-side, with a clean pre-flight for address-less customers.

**Architecture:** A new `create_orders_bulk` Postgres RPC reuses the existing `create_order_with_items` per element inside one transaction (all-or-nothing). A new `createOrdersBulkAction` Server Action parses input (Zod-first), loads the catalog once, batch-fetches per-customer price overrides (no N+1), enriches each customer's items with the existing pure `enrichOrderItems`, pre-flights addresses, calls the repo, and writes one `order.bulk_created` audit entry. Existing single-order creation and the freeze-on-create rule are untouched.

**Tech Stack:** Next.js 15 App Router, TypeScript (strict), Supabase Postgres + RLS, Zod, Vitest. Money in kuruş (`bigint`/`numeric`).

**Spec:** `docs/superpowers/specs/2026-06-21-bulk-order-entry-design.md` (§2, §4.4, §4.5, §4.6, §5).

## Global Constraints

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`. **`any` banned** — the sole exception is the established `(supabase as any).rpc(...)` / `.from(...)` cast already used in repositories (RPCs/new tables aren't in generated types).
- Every Server Action / Route Handler: **first logic is Zod `safeParse`**. Schemas live in `domain/*.schema.ts`.
- **`Result<T, E>` over try/catch.** Errors extend `AppError` with an enum `code`. No error is swallowed; log with `logger` (never `console`).
- Money in **kuruş**, `bigint`/`numeric`, no floats. Dates `YYYY-MM-DD` (Europe/Istanbul calendar day).
- **RLS on.** RPC is `security invoker` + `set search_path = public` (match the existing RPC). All DB changes via **migration** (no manual SQL).
- **Cross-feature imports only via `application/`** — `orders` calls into `customers`/`products` through their `application/` exports only (ESLint `boundaries`).
- **Safety cap:** ≤250 orders per bulk commit, enforced in both Zod schema and the RPC.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` must pass; new migration must run under `supabase db reset`.
- **No per-line price override from the client** in v1: the client sends only `{product_key, quantity}`; the server is authoritative on price (catalog tiers + per-customer overrides). Therefore the single-order action's `reconcileCustomerProductPrices` step is intentionally **not** part of the bulk path.

**Testing convention (match the repo):** Only pure domain/application logic is unit-tested (Vitest, `features/**/*.test.ts`, `@/` alias, `describe`/`it`, narrow on `result.ok` then read `.value`/`.error`). DB repositories, the RPC migration, and the Server Action are verified by `pnpm typecheck` + `pnpm lint` + `supabase db reset` (and a manual SQL smoke), **not** by unit tests. Tasks below mark which cycle applies.

---

### Task 1: Pure bulk-pricing logic (`enrichBulkOrders` + `groupOverridesByCustomer`)

This is the testable heart of the backend: group flat override rows per customer, then enrich each customer's items by reusing the existing `enrichOrderItems`. No DB, full TDD.

**Files:**
- Create: `features/orders/application/bulk-order-pricing.ts`
- Test: `features/orders/application/bulk-order-pricing.test.ts`

**Interfaces:**
- Consumes (existing): `enrichOrderItems`, `EnrichedOrderItem` from `@/features/orders/application/order-item-pricing`; `Product` from `@/features/products/application/list-products`; `ValidationError` (mirror the import path used in `features/orders/application/order-item-pricing.ts`); `ok`, `err`, `Result` from `@/shared/result`.
- Produces (later tasks rely on these exact names/types):
  - `type BulkEnrichedOrder = { customer_id: string; items: EnrichedOrderItem[] }`
  - `groupOverridesByCustomer(rows: ReadonlyArray<{ customer_id: string; product_key: string; unit_price_minor: number }>): Map<string, Record<string, number>>`
  - `enrichBulkOrders(orders, products, overridesByCustomer): Result<BulkEnrichedOrder[], ValidationError>` where `orders: ReadonlyArray<{ customer_id: string; items: ReadonlyArray<{ product_key: string; quantity: number }> }>`, `products: ReadonlyArray<Product>`, `overridesByCustomer: ReadonlyMap<string, Record<string, number>>`.

- [ ] **Step 1: Write the failing test**

```ts
// features/orders/application/bulk-order-pricing.test.ts
import { describe, expect, it } from "vitest";

import {
  enrichBulkOrders,
  groupOverridesByCustomer,
} from "@/features/orders/application/bulk-order-pricing";

import type { Product } from "@/features/products/application/list-products";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    key: "eggs",
    display_name: "Yumurta",
    unit: "package",
    unit_label: "paket",
    package_size: 15,
    min_qty: 1,
    step: 1,
    current_unit_price_minor: 12500,
    price_tiers: [],
    active: true,
    ...overrides,
  };
}

const EGGS = makeProduct();
const MILK = makeProduct({
  key: "milk",
  display_name: "Süt",
  unit: "liter",
  unit_label: "lt",
  package_size: 1,
  current_unit_price_minor: 5000,
});
const CHEESE = makeProduct({
  key: "cheese",
  display_name: "Peynir",
  unit: "kilogram",
  unit_label: "kg",
  package_size: 1,
  min_qty: 0.5,
  step: 0.5,
  current_unit_price_minor: 10000,
});
const CATALOG: Product[] = [EGGS, MILK, CHEESE];

describe("groupOverridesByCustomer", () => {
  it("groups flat rows into a per-customer price map", () => {
    const map = groupOverridesByCustomer([
      { customer_id: "c1", product_key: "milk", unit_price_minor: 4500 },
      { customer_id: "c1", product_key: "eggs", unit_price_minor: 12000 },
      { customer_id: "c2", product_key: "milk", unit_price_minor: 4800 },
    ]);
    expect(map.get("c1")).toEqual({ milk: 4500, eggs: 12000 });
    expect(map.get("c2")).toEqual({ milk: 4800 });
    expect(map.get("c3")).toBeUndefined();
  });
});

describe("enrichBulkOrders", () => {
  it("prices each customer from the catalog when no override exists", () => {
    const result = enrichBulkOrders(
      [{ customer_id: "c1", items: [{ product_key: "eggs", quantity: 3 }] }],
      CATALOG,
      new Map(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const order = result.value[0]!;
    expect(order.customer_id).toBe("c1");
    expect(order.items[0]!.unit_price_minor).toBe(12500);
    expect(order.items[0]!.line_total_minor).toBe(37500);
  });

  it("applies a per-customer override price over the catalog price", () => {
    const overrides = new Map<string, Record<string, number>>([
      ["c1", { milk: 4500 }],
    ]);
    const result = enrichBulkOrders(
      [{ customer_id: "c1", items: [{ product_key: "milk", quantity: 2 }] }],
      CATALOG,
      overrides,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.items[0]!.unit_price_minor).toBe(4500);
    expect(result.value[0]!.items[0]!.line_total_minor).toBe(9000);
  });

  it("rejects with a customer-tagged ValidationError on a bad step", () => {
    const result = enrichBulkOrders(
      [{ customer_id: "c9", items: [{ product_key: "cheese", quantity: 0.3 }] }],
      CATALOG,
      new Map(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("c9");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run features/orders/application/bulk-order-pricing.test.ts`
Expected: FAIL — "Failed to resolve import ... bulk-order-pricing" / functions not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
// features/orders/application/bulk-order-pricing.ts
import {
  enrichOrderItems,
  type EnrichedOrderItem,
} from "@/features/orders/application/order-item-pricing";
import type { Product } from "@/features/products/application/list-products";
import { err, ok, type Result } from "@/shared/result";
// Match the ValidationError import path used in order-item-pricing.ts:
import { ValidationError } from "@/shared/errors";

export interface BulkEnrichedOrder {
  customer_id: string;
  items: EnrichedOrderItem[];
}

export function groupOverridesByCustomer(
  rows: ReadonlyArray<{
    customer_id: string;
    product_key: string;
    unit_price_minor: number;
  }>,
): Map<string, Record<string, number>> {
  const map = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const existing = map.get(row.customer_id) ?? {};
    existing[row.product_key] = row.unit_price_minor;
    map.set(row.customer_id, existing);
  }
  return map;
}

export function enrichBulkOrders(
  orders: ReadonlyArray<{
    customer_id: string;
    items: ReadonlyArray<{ product_key: string; quantity: number }>;
  }>,
  products: ReadonlyArray<Product>,
  overridesByCustomer: ReadonlyMap<string, Record<string, number>>,
): Result<BulkEnrichedOrder[], ValidationError> {
  const out: BulkEnrichedOrder[] = [];

  for (const order of orders) {
    const overrides = overridesByCustomer.get(order.customer_id) ?? {};

    const withPrices = order.items.map((item) => {
      const override = overrides[item.product_key];
      // Omit unit_price_minor entirely when absent (exactOptionalPropertyTypes).
      return override != null
        ? {
            product_key: item.product_key,
            quantity: item.quantity,
            unit_price_minor: override,
          }
        : { product_key: item.product_key, quantity: item.quantity };
    });

    const enriched = enrichOrderItems(withPrices, products);
    if (!enriched.ok) {
      return err(
        new ValidationError({
          message: `${order.customer_id}: ${enriched.error.message}`,
        }),
      );
    }
    out.push({ customer_id: order.customer_id, items: enriched.value });
  }

  return ok(out);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run features/orders/application/bulk-order-pricing.test.ts`
Expected: PASS (all cases). If the `ValidationError` import path is wrong, copy the exact one from `features/orders/application/order-item-pricing.ts`.

- [ ] **Step 5: Commit**

```bash
git add features/orders/application/bulk-order-pricing.ts features/orders/application/bulk-order-pricing.test.ts
git commit -m "feat(orders): pure bulk-order pricing + override grouping"
```

---

### Task 2: Bulk order input schema (`bulkOrderSchema`)

Single Zod source for the action's boundary parse. Pure, TDD.

**Files:**
- Create: `features/orders/domain/bulk-order.schema.ts`
- Test: `features/orders/domain/bulk-order.schema.test.ts`

**Interfaces:**
- Produces: `bulkOrderSchema` (Zod) and `type BulkOrderInput = z.infer<typeof bulkOrderSchema>`. Shape: `{ scheduled_for: string; time_slot: "morning"|"afternoon"|"evening"|null; payment_method: "cash_on_delivery"|"bank_transfer"; delivery_fee_minor: number; orders: Array<{ customer_id: string; items: Array<{ product_key: string; quantity: number }> }> }`.

- [ ] **Step 1: Write the failing test**

```ts
// features/orders/domain/bulk-order.schema.test.ts
import { describe, expect, it } from "vitest";

import { bulkOrderSchema } from "@/features/orders/domain/bulk-order.schema";

const valid = {
  scheduled_for: "2026-06-23",
  time_slot: "morning",
  payment_method: "cash_on_delivery",
  delivery_fee_minor: 0,
  orders: [
    {
      customer_id: "11111111-1111-1111-1111-111111111111",
      items: [{ product_key: "eggs", quantity: 3 }],
    },
  ],
};

describe("bulkOrderSchema", () => {
  it("parses a valid batch", () => {
    const parsed = bulkOrderSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("accepts null time_slot", () => {
    expect(bulkOrderSchema.safeParse({ ...valid, time_slot: null }).success).toBe(true);
  });

  it("rejects a bad date format", () => {
    expect(
      bulkOrderSchema.safeParse({ ...valid, scheduled_for: "23/06/2026" }).success,
    ).toBe(false);
  });

  it("rejects an order with zero items", () => {
    expect(
      bulkOrderSchema.safeParse({
        ...valid,
        orders: [{ customer_id: valid.orders[0]!.customer_id, items: [] }],
      }).success,
    ).toBe(false);
  });

  it("rejects more than 250 orders", () => {
    const orders = Array.from({ length: 251 }, () => ({
      customer_id: "11111111-1111-1111-1111-111111111111",
      items: [{ product_key: "eggs", quantity: 1 }],
    }));
    expect(bulkOrderSchema.safeParse({ ...valid, orders }).success).toBe(false);
  });

  it("rejects a non-positive quantity", () => {
    expect(
      bulkOrderSchema.safeParse({
        ...valid,
        orders: [
          {
            customer_id: valid.orders[0]!.customer_id,
            items: [{ product_key: "eggs", quantity: 0 }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run features/orders/domain/bulk-order.schema.test.ts`
Expected: FAIL — cannot resolve `bulk-order.schema`.

- [ ] **Step 3: Write minimal implementation**

```ts
// features/orders/domain/bulk-order.schema.ts
import { z } from "zod";

export const MAX_BULK_ORDERS = 250;

const bulkOrderItemSchema = z.object({
  product_key: z.string().min(1),
  quantity: z.number().positive(),
});

const bulkCustomerOrderSchema = z.object({
  customer_id: z.string().uuid(),
  items: z.array(bulkOrderItemSchema).min(1, "En az bir ürün gerekli."),
});

export const bulkOrderSchema = z.object({
  scheduled_for: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-MM-DD formatında olmalı."),
  time_slot: z.enum(["morning", "afternoon", "evening"]).nullable(),
  payment_method: z.enum(["cash_on_delivery", "bank_transfer"]),
  delivery_fee_minor: z.coerce.number().int().nonnegative().default(0),
  orders: z
    .array(bulkCustomerOrderSchema)
    .min(1, "En az bir müşteri seç.")
    .max(MAX_BULK_ORDERS, `Tek seferde en fazla ${MAX_BULK_ORDERS} sipariş.`),
});

export type BulkOrderInput = z.infer<typeof bulkOrderSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run features/orders/domain/bulk-order.schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/orders/domain/bulk-order.schema.ts features/orders/domain/bulk-order.schema.test.ts
git commit -m "feat(orders): bulk order input schema (max 250)"
```

---

### Task 3: Customer batch queries (overrides + missing-address pre-flight)

Two batch reads in the **customers** feature, exposed via `application/`, so `orders` consumes them without N+1 and without reaching into the customers repository. DB code → verified by `pnpm typecheck` + `pnpm lint` (no unit test, per repo convention).

**Files:**
- Create: `features/customers/infrastructure/customer-bulk.repository.ts`
- Modify: `features/customers/application/customer-price-actions.ts` (add two exports; mirror its existing import style)

**Interfaces:**
- Consumes (existing, mirror `features/customers/infrastructure/customer-price.repository.ts`): `createSupabaseServerClient`, `logger`, `ok`/`err`/`Result`, `ExternalApiError`.
- Produces:
  - `getCustomerProductPricesBatch(customerIds: string[]): Promise<Result<Array<{ customer_id: string; product_key: string; unit_price_minor: number }>, ExternalApiError>>`
  - `getCustomersMissingPrimaryAddress(customerIds: string[]): Promise<Result<string[], ExternalApiError>>`
  - Application wrappers: `getCustomerProductPricesBatchAction(customerIds: string[]): Promise<Array<{ customer_id: string; product_key: string; unit_price_minor: number }>>` and `getCustomersMissingPrimaryAddressAction(customerIds: string[]): Promise<string[]>`.

- [ ] **Step 1: Create the repository**

```ts
// features/customers/infrastructure/customer-bulk.repository.ts
import { createSupabaseServerClient } from "@/shared/supabase/server"; // mirror customer-price.repository.ts
import { ExternalApiError } from "@/shared/errors";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

export async function getCustomerProductPricesBatch(
  customerIds: string[],
): Promise<
  Result<
    Array<{ customer_id: string; product_key: string; unit_price_minor: number }>,
    ExternalApiError
  >
> {
  if (customerIds.length === 0) return ok([]);
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("customer_product_prices")
    .select("customer_id, product_key, unit_price_minor")
    .in("customer_id", customerIds);
  if (error) {
    logger.error(
      { count: customerIds.length, code: error.code },
      "get_customer_prices_batch_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(
    (
      (data ?? []) as Array<{
        customer_id: string;
        product_key: string;
        unit_price_minor: number | string;
      }>
    ).map((r) => ({
      customer_id: r.customer_id,
      product_key: r.product_key,
      unit_price_minor: Number(r.unit_price_minor),
    })),
  );
}

export async function getCustomersMissingPrimaryAddress(
  customerIds: string[],
): Promise<Result<string[], ExternalApiError>> {
  if (customerIds.length === 0) return ok([]);
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("addresses")
    .select("customer_id")
    .eq("is_primary", true)
    .in("customer_id", customerIds);
  if (error) {
    logger.error(
      { count: customerIds.length, code: error.code },
      "get_customers_missing_address_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  const withAddress = new Set(
    ((data ?? []) as Array<{ customer_id: string }>).map((r) => r.customer_id),
  );
  return ok(customerIds.filter((id) => !withAddress.has(id)));
}
```

> Confirm the `createSupabaseServerClient` and `ExternalApiError` import paths by opening `features/customers/infrastructure/customer-price.repository.ts` and copying its imports verbatim.

- [ ] **Step 2: Add the application wrappers**

Append to `features/customers/application/customer-price-actions.ts` (keep the existing `"use server"` directive at the top of the file if present):

```ts
import {
  getCustomerProductPricesBatch,
  getCustomersMissingPrimaryAddress,
} from "@/features/customers/infrastructure/customer-bulk.repository";

export async function getCustomerProductPricesBatchAction(
  customerIds: string[],
): Promise<
  Array<{ customer_id: string; product_key: string; unit_price_minor: number }>
> {
  const res = await getCustomerProductPricesBatch(customerIds);
  return res.ok ? res.value : [];
}

export async function getCustomersMissingPrimaryAddressAction(
  customerIds: string[],
): Promise<string[]> {
  const res = await getCustomersMissingPrimaryAddress(customerIds);
  // On query failure, be conservative: treat none as "missing" here and let the
  // RPC's own guard reject any address-less customer at commit (defense in depth).
  return res.ok ? res.value : [];
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. Fix any import-path mismatches.

- [ ] **Step 4: Commit**

```bash
git add features/customers/infrastructure/customer-bulk.repository.ts features/customers/application/customer-price-actions.ts
git commit -m "feat(customers): batch override + missing-address queries for bulk orders"
```

---

### Task 4: `create_orders_bulk` migration (RPC)

Reuses `create_order_with_items` per element inside one transaction → atomic, DRY, freeze-on-create rule untouched. Verified by `supabase db reset`.

**Files:**
- Create: `supabase/migrations/20260621120000_create_orders_bulk.sql`

**Interfaces:**
- Produces RPC `create_orders_bulk(p_orders jsonb, p_created_by uuid) returns jsonb`. `p_orders` element shape: `{ customer_id, scheduled_for, time_slot, payment_method, delivery_notes, delivery_fee_minor, items: [{product_key, quantity, unit_price_minor, product_snapshot}] }`. Returns a JSON array of `{ customer_id, order_id, order_number }`.

- [ ] **Step 1: Write the migration**

```sql
-- 20260621120000_create_orders_bulk.sql
-- Bulk-create orders for many customers in ONE transaction.
-- Reuses create_order_with_items per element (DRY) so address snapshot,
-- item insert, subtotal, and the initial 'pending' status event stay identical.
-- All-or-nothing: if any element raises, the whole batch rolls back.

create or replace function create_orders_bulk(
  p_orders jsonb,
  p_created_by uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_elem jsonb;
  v_order_id uuid;
  v_order_number text;
  v_results jsonb := '[]'::jsonb;
  v_count int;
begin
  select count(*) into v_count from jsonb_array_elements(p_orders);

  if v_count = 0 then
    raise exception 'bulk order needs at least one order'
      using errcode = 'P0001';
  end if;

  if v_count > 250 then
    raise exception 'bulk order exceeds max batch size (250): %', v_count
      using errcode = 'P0001';
  end if;

  for v_elem in select * from jsonb_array_elements(p_orders)
  loop
    v_order_id := create_order_with_items(
      (v_elem->>'customer_id')::uuid,
      (v_elem->>'scheduled_for')::date,
      nullif(v_elem->>'time_slot', '')::time_slot,
      (v_elem->>'payment_method')::payment_method,
      nullif(v_elem->>'delivery_notes', ''),
      coalesce((v_elem->>'delivery_fee_minor')::bigint, 0),
      p_created_by,
      v_elem->'items'
    );

    select order_number into v_order_number from orders where id = v_order_id;

    v_results := v_results || jsonb_build_object(
      'customer_id', v_elem->>'customer_id',
      'order_id', v_order_id,
      'order_number', v_order_number
    );
  end loop;

  return v_results;
end;
$$;

grant execute on function create_orders_bulk(jsonb, uuid) to authenticated;
```

> If `create_order_with_items` was granted to a different role in `20260506190022_create_order_with_items_v2.sql`, mirror that grant exactly.

- [ ] **Step 2: Apply and verify locally**

Run: `supabase db reset`
Expected: completes with no error; the new migration is listed as applied.

- [ ] **Step 3: Manual SQL smoke (atomicity + address guard)**

Using the local SQL console (`supabase db reset` leaves seed data; pick a seeded customer **with** a primary address as `<C1>` and any uuid **without** one as `<C2>`):

```sql
-- happy path: two valid orders commit and return rows
select create_orders_bulk(
  '[{"customer_id":"<C1>","scheduled_for":"2026-06-23","time_slot":"morning",
     "payment_method":"cash_on_delivery","delivery_notes":null,"delivery_fee_minor":0,
     "items":[{"product_key":"eggs","quantity":3,"unit_price_minor":12500,
               "product_snapshot":{"display_name":"Yumurta","unit":"package","unit_label":"paket"}}]}]'::jsonb,
  '00000000-0000-0000-0000-000000000000'::uuid
);

-- rollback path: a batch including an address-less customer raises and creates NOTHING
select create_orders_bulk(
  '[{"customer_id":"<C2>","scheduled_for":"2026-06-23","time_slot":null,
     "payment_method":"cash_on_delivery","delivery_notes":null,"delivery_fee_minor":0,
     "items":[{"product_key":"eggs","quantity":1,"unit_price_minor":12500,
               "product_snapshot":{"display_name":"Yumurta","unit":"package","unit_label":"paket"}}]}]'::jsonb,
  '00000000-0000-0000-0000-000000000000'::uuid
);
-- Expect: ERROR "customer <C2> has no primary address"; then verify no orphan orders for <C2>.
```
Expected: first call returns a JSON array with one `{customer_id, order_id, order_number}`; second call errors and leaves no new rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260621120000_create_orders_bulk.sql
git commit -m "feat(db): create_orders_bulk RPC (atomic multi-order, reuses single-order fn)"
```

---

### Task 5: Repository `createOrdersBulk`

Thin wrapper that maps domain input → RPC params and the JSON result back → typed rows, in the existing repo style. DB code → verified by `pnpm typecheck` + `pnpm lint`.

**Files:**
- Modify: `features/orders/infrastructure/order.repository.ts` (add the function + types; reuse the file's existing imports for `createSupabaseServerClient`, `logger`, `ok`/`err`, `ExternalApiError`, `ValidationError`, `OrderRepoFailure`, and `EnrichedOrderItem`/`TimeSlot`/`PaymentMethod`)

**Interfaces:**
- Consumes: `EnrichedOrderItem` (from `bulk-order-pricing` / `order-item-pricing`), `TimeSlot`, `PaymentMethod`.
- Produces:
  - `interface BulkOrderRepoInput { scheduled_for: string; time_slot: TimeSlot | null; payment_method: PaymentMethod; delivery_fee_minor: number; created_by: string; orders: ReadonlyArray<{ customer_id: string; delivery_notes: string | null; items: ReadonlyArray<EnrichedOrderItem> }> }`
  - `interface BulkOrderResultRow { customer_id: string; order_id: string; order_number: string }`
  - `createOrdersBulk(input: BulkOrderRepoInput): Promise<Result<BulkOrderResultRow[], OrderRepoFailure>>`

- [ ] **Step 1: Add the function**

```ts
// Append to features/orders/infrastructure/order.repository.ts
// (uses the EnrichedOrderItem type already imported for CreateOrderInput; if it
//  isn't imported yet, add: import type { EnrichedOrderItem } from "@/features/orders/application/order-item-pricing";)

export interface BulkOrderRepoInput {
  scheduled_for: string;
  time_slot: TimeSlot | null;
  payment_method: PaymentMethod;
  delivery_fee_minor: number;
  created_by: string;
  orders: ReadonlyArray<{
    customer_id: string;
    delivery_notes: string | null;
    items: ReadonlyArray<EnrichedOrderItem>;
  }>;
}

export interface BulkOrderResultRow {
  customer_id: string;
  order_id: string;
  order_number: string;
}

export async function createOrdersBulk(
  input: BulkOrderRepoInput,
): Promise<Result<BulkOrderResultRow[], OrderRepoFailure>> {
  const supabase = await createSupabaseServerClient();

  const p_orders = input.orders.map((o) => ({
    customer_id: o.customer_id,
    scheduled_for: input.scheduled_for,
    time_slot: input.time_slot,
    payment_method: input.payment_method,
    delivery_notes: o.delivery_notes,
    delivery_fee_minor: input.delivery_fee_minor,
    items: o.items,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: rpcError } = await (supabase as any).rpc(
    "create_orders_bulk",
    { p_orders, p_created_by: input.created_by },
  );

  if (rpcError) {
    logger.error(
      { code: rpcError.code, message: rpcError.message, count: p_orders.length },
      "create_orders_bulk_rpc_failed",
    );
    if (rpcError.message?.includes("no primary address")) {
      return err(
        new ValidationError({
          message:
            "Seçili müşterilerden birinin kayıtlı adresi yok; toplu sipariş iptal edildi.",
          cause: rpcError,
        }),
      );
    }
    return err(
      new ExternalApiError({ message: rpcError.message, cause: rpcError }),
    );
  }

  return ok(
    ((data ?? []) as Array<{
      customer_id: string;
      order_id: string;
      order_number: string;
    }>).map((r) => ({
      customer_id: r.customer_id,
      order_id: r.order_id,
      order_number: r.order_number,
    })),
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add features/orders/infrastructure/order.repository.ts
git commit -m "feat(orders): createOrdersBulk repository wrapper for create_orders_bulk RPC"
```

---

### Task 6: `createOrdersBulkAction` Server Action

The integration point: Zod-first parse → load catalog once → batch overrides → `enrichBulkOrders` → address pre-flight → repo → one `order.bulk_created` audit entry → revalidate. Pure sub-logic is already tested (Task 1/2); this task is verified by `pnpm typecheck` + `pnpm lint`.

**Files:**
- Create: `features/orders/application/create-orders-bulk.ts`
- Modify: `shared/audit/log-audit.ts` (add `"order.bulk_created"` to the `AuditAction` union, right after `"order.created"`)

**Interfaces:**
- Consumes: `bulkOrderSchema` (Task 2), `enrichBulkOrders`/`groupOverridesByCustomer` (Task 1), `createOrdersBulk`/`BulkOrderResultRow` (Task 5), `listActiveProducts` (`@/features/products/application/list-products`), `getCustomerProductPricesBatchAction`/`getCustomersMissingPrimaryAddressAction` (Task 3), `getCurrentUser` (`@/features/auth/application/get-session`), `logAudit` (`@/shared/audit/log-audit`), `logger`, `revalidatePath` (`next/cache`).
- Produces:
  - `type CreateOrdersBulkState = { status: "idle" } | { status: "success"; created: number; orderNumbers: string[] } | { status: "validation_error"; fieldErrors: Record<string, string[]> } | { status: "missing_address"; customerIds: string[] } | { status: "error"; message: string }`
  - `createOrdersBulkAction(_previous: CreateOrdersBulkState, formData: FormData): Promise<CreateOrdersBulkState>` — reads a single field `batch_json` (a JSON string of the `bulkOrderSchema` shape).

- [ ] **Step 1: Add the audit action**

In `shared/audit/log-audit.ts`, change the `AuditAction` union:

```ts
export type AuditAction =
  | "customer.created"
  | "customer.updated"
  | "customer.deleted"
  | "order.created"
  | "order.bulk_created"
  | "order.transitioned"
  | "order.delivery_reverted"
  | "order.updated"
  | "order.deleted"
  | "product.created"
  | "product.updated"
  | "product.archived"
  | "payment.recorded"
  | "payment.deleted";
```

- [ ] **Step 2: Write the action**

```ts
// features/orders/application/create-orders-bulk.ts
"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/features/auth/application/get-session";
import {
  getCustomerProductPricesBatchAction,
  getCustomersMissingPrimaryAddressAction,
} from "@/features/customers/application/customer-price-actions";
import { bulkOrderSchema } from "@/features/orders/domain/bulk-order.schema";
import {
  enrichBulkOrders,
  groupOverridesByCustomer,
} from "@/features/orders/application/bulk-order-pricing";
import { createOrdersBulk } from "@/features/orders/infrastructure/order.repository";
import { listActiveProducts } from "@/features/products/application/list-products";
import { logAudit } from "@/shared/audit/log-audit";
import { logger } from "@/shared/logger";

export type CreateOrdersBulkState =
  | { status: "idle" }
  | { status: "success"; created: number; orderNumbers: string[] }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | { status: "missing_address"; customerIds: string[] }
  | { status: "error"; message: string };

export async function createOrdersBulkAction(
  _previous: CreateOrdersBulkState,
  formData: FormData,
): Promise<CreateOrdersBulkState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Oturum bulunamadı, tekrar giriş yapın." };
  }

  let batchJson: unknown;
  try {
    const raw = formData.get("batch_json");
    batchJson = typeof raw === "string" ? JSON.parse(raw) : null;
  } catch {
    return { status: "error", message: "Sepet verisi okunamadı." };
  }

  const parsed = bulkOrderSchema.safeParse(batchJson);
  if (!parsed.success) {
    return {
      status: "validation_error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { scheduled_for, time_slot, payment_method, delivery_fee_minor, orders } =
    parsed.data;
  const customerIds = orders.map((o) => o.customer_id);

  // Pre-flight: address-less customers come back as a clean list (no failed tx).
  const missing = await getCustomersMissingPrimaryAddressAction(customerIds);
  if (missing.length > 0) {
    return { status: "missing_address", customerIds: missing };
  }

  // Load catalog once + batch-fetch per-customer overrides (no N+1).
  const productsResult = await listActiveProducts();
  if (!productsResult.ok) {
    return { status: "error", message: productsResult.error.message };
  }
  const overrideRows = await getCustomerProductPricesBatchAction(customerIds);
  const overridesByCustomer = groupOverridesByCustomer(overrideRows);

  const enriched = enrichBulkOrders(orders, productsResult.value, overridesByCustomer);
  if (!enriched.ok) {
    return {
      status: "validation_error",
      fieldErrors: { items: [enriched.error.message] },
    };
  }

  const created = await createOrdersBulk({
    scheduled_for,
    time_slot,
    payment_method,
    delivery_fee_minor,
    created_by: user.id,
    orders: enriched.value.map((o) => ({
      customer_id: o.customer_id,
      delivery_notes: null,
      items: o.items,
    })),
  });

  if (!created.ok) {
    logger.error({ code: created.error.code }, "create_orders_bulk_failed");
    return { status: "error", message: created.error.message };
  }

  await logAudit({
    actor_id: user.id,
    action: "order.bulk_created",
    entity_type: "order",
    entity_id: created.value[0]?.order_id ?? "batch",
    after: {
      scheduled_for,
      count: created.value.length,
      order_numbers: created.value.map((r) => r.order_number),
    },
  });

  revalidatePath("/orders");
  return {
    status: "success",
    created: created.value.length,
    orderNumbers: created.value.map((r) => r.order_number),
  };
}
```

> `entity_type: "order"` must be a valid `AuditEntityType`; confirm "order" is in that union in `shared/audit/log-audit.ts` (the single-order action already uses it).

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. The cross-feature imports (`orders` → `customers/application`, `orders` → `products/application`) are allowed by the `boundaries` rule; if lint flags a deep import, switch to the feature's public `application/` entry.

- [ ] **Step 4: Full test suite + commit**

Run: `pnpm test`
Expected: PASS (Task 1/2 suites green; nothing else regressed).

```bash
git add features/orders/application/create-orders-bulk.ts shared/audit/log-audit.ts
git commit -m "feat(orders): createOrdersBulkAction (atomic bulk create + pre-flight + audit)"
```

---

## Self-Review

**Spec coverage:**
- §4.4 atomic bulk RPC → Task 4; repo wrapper → Task 5; action with Zod-first/Result/audit/revalidate → Task 6. ✅
- §4.4 batch-fetch overrides, no N+1 → Task 3 (`getCustomerProductPricesBatch`) + Task 6 wiring. ✅
- §4.4 pre-flight address check (clean list, not failed tx) → Task 3 (`getCustomersMissingPrimaryAddress`) + Task 6 `missing_address` state; RPC guard as defense-in-depth → Task 4. ✅
- §4.4 safety cap ≤250 → Task 2 (schema) + Task 4 (RPC). ✅
- §4.4 one `order.bulk_created` audit entry → Task 6 + union edit. ✅
- §5 tests: per-customer override applied in a batch → Task 1; step validation → Task 1; (coverage/reducers + localStorage Zod parse live in the UI plan, which owns `draft-batch.ts`). ✅
- §2 freeze-on-create untouched → Task 4 reuses `create_order_with_items` verbatim. ✅

**Placeholder scan:** No "TBD"/"add error handling"/"similar to". `<C1>/<C2>` in Task 4 Step 3 are runtime values the executor picks from seed data (documented), not code placeholders. The few "mirror the existing import path" notes point at named existing files — the executor copies a real line, not invents one.

**Type consistency:** `EnrichedOrderItem` (Task 1) flows into `BulkOrderRepoInput.orders[].items` (Task 5) and `enrichBulkOrders` output (Task 1) → Task 6. `BulkOrderResultRow` (Task 5) is consumed in Task 6's audit/return. `bulkOrderSchema`/`BulkOrderInput` (Task 2) parsed in Task 6. Names match across tasks. ✅

**Out of scope (in UI plan):** `draft-batch.ts` domain (coverage + reducers + localStorage Zod parse), the screen/panel components, and wiring `/orders/new`.
