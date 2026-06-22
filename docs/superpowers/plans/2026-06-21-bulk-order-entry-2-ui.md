# Bulk Order Entry — UI (Split-Screen Basket × Customer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the split-screen order-entry screen — left = controlled customer pick-list (multi-select), right = smart basket panel with coverage badges — backed by a localStorage draft, committing through the bulk action from Plan 1.

**Architecture:** A pure `draft-batch` domain (coverage + reducers + persistence parse, fully TDD) holds the batch state `{ date, defaults, assignments: customerId → BasketLine[] }`. A `useDraftBatch` hook persists it to localStorage (Zod-parsed on load, mirroring the repo's `useColumnPrefs` pattern). Client components — `CustomerPickList`, `BasketPanel`/`CoverageLineRow`, and the `BulkOrderScreen` orchestrator — render on top. `/orders/new` becomes the bulk screen; the old single-order `OrderForm` is retired (n=1 = select one row).

**Tech Stack:** Next.js 15 App Router, React 19 (`useTransition`), Tailwind 4, shadcn/ui (`Sheet`, `Select`, `Badge`, `Button`, `Input`, `Separator`), Vitest. Money in kuruş.

**Spec:** `docs/superpowers/specs/2026-06-21-bulk-order-entry-design.md` (§3, §4.2, §4.3, §4.5, §4.6, §5).
**Depends on:** Plan 1 (backend) — `createOrdersBulkAction`/`CreateOrdersBulkState` and `getCustomersMissingPrimaryAddressAction` must exist.

## Global Constraints

- TypeScript `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. **`any` banned** (only the established `(supabase as any)` repo cast). No `console` — use `logger` in server code; client UI uses `toast` (sonner) for user-facing messages.
- **Server Component default;** Client Component only where interactivity is needed (the whole screen is interactive → `"use client"` for the screen + panel + list + hook; the page stays a Server Component that loads the catalog).
- **Zod parse at every external boundary** — localStorage read is a boundary: parse with Zod, discard invalid/stale.
- Money in **kuruş** via `@/shared/utils/money` (`formatTRY`, `parseTRYInput`, `sumMinor`). No floats, no ad-hoc currency strings.
- Cross-feature imports only via `application/` (ESLint `boundaries`): `orders` UI reads `products`/`customers` through their `application/` exports.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` green.

**Testing convention:** Pure domain logic (Task 1, 2) is unit-tested with Vitest (`node` env). Hooks and React components run in interactivity the `node` test env doesn't cover, so Tasks 3 + 5–9 are verified by `pnpm typecheck` + `pnpm lint` + a manual run (`pnpm dev`), not unit tests. Tailwind class strings in component code are illustrative — match the house look while implementing.

---

### Task 1: `draft-batch` domain — coverage + reducers (pure, TDD)

The heart of the screen. Pure, immutable, fully tested — this is where the pekmez/mixed-selection logic lives.

**Files:**
- Create: `features/orders/domain/draft-batch.ts`
- Test: `features/orders/domain/draft-batch.test.ts`

**Interfaces:**
- Consumes: `TimeSlot`, `PaymentMethod` from `@/features/orders/domain/order`.
- Produces:
  - `type BasketLine = { product_key: string; quantity: number }`
  - `interface DraftBatch { scheduledFor: string; defaults: { timeSlot: TimeSlot | null; paymentMethod: PaymentMethod; deliveryFeeMinor: number }; assignments: Record<string, BasketLine[]> }`
  - `interface CoverageLine { product_key: string; presentCount: number; total: number; state: "all" | "partial"; commonQty: number | null; mixedQty: boolean }`
  - `emptyBatch(scheduledFor: string): DraftBatch`
  - `computeCoverage(selectedIds: readonly string[], batch: DraftBatch): CoverageLine[]`
  - `applyLine(batch: DraftBatch, ids: readonly string[], line: BasketLine): DraftBatch`
  - `removeLine(batch: DraftBatch, ids: readonly string[], productKey: string): DraftBatch`
  - `clearCustomers(batch: DraftBatch, ids: readonly string[]): DraftBatch`

- [ ] **Step 1: Write the failing test**

```ts
// features/orders/domain/draft-batch.test.ts
import { describe, expect, it } from "vitest";

import {
  applyLine,
  clearCustomers,
  computeCoverage,
  emptyBatch,
  removeLine,
  type DraftBatch,
} from "@/features/orders/domain/draft-batch";

const base = (): DraftBatch => ({
  scheduledFor: "2026-06-23",
  defaults: { timeSlot: null, paymentMethod: "cash_on_delivery", deliveryFeeMinor: 0 },
  assignments: {
    a: [{ product_key: "eggs", quantity: 3 }, { product_key: "milk", quantity: 1 }],
    b: [{ product_key: "eggs", quantity: 3 }, { product_key: "milk", quantity: 1 }],
    c: [{ product_key: "eggs", quantity: 3 }, { product_key: "pekmez", quantity: 1 }],
  },
});

describe("emptyBatch", () => {
  it("starts with the given date and no assignments", () => {
    const b = emptyBatch("2026-06-23");
    expect(b.scheduledFor).toBe("2026-06-23");
    expect(b.assignments).toEqual({});
    expect(b.defaults.paymentMethod).toBe("cash_on_delivery");
  });
});

describe("computeCoverage", () => {
  it("returns [] for an empty selection", () => {
    expect(computeCoverage([], base())).toEqual([]);
  });

  it("marks a product all 3 share at the same qty as 'all'", () => {
    const cov = computeCoverage(["a", "b", "c"], base());
    const eggs = cov.find((l) => l.product_key === "eggs")!;
    expect(eggs.state).toBe("all");
    expect(eggs.presentCount).toBe(3);
    expect(eggs.total).toBe(3);
    expect(eggs.commonQty).toBe(3);
    expect(eggs.mixedQty).toBe(false);
  });

  it("marks the pekmez (1 of 3) as 'partial'", () => {
    const cov = computeCoverage(["a", "b", "c"], base());
    const pekmez = cov.find((l) => l.product_key === "pekmez")!;
    expect(pekmez.state).toBe("partial");
    expect(pekmez.presentCount).toBe(1);
    expect(pekmez.total).toBe(3);
  });

  it("marks milk as partial when only a,b have it", () => {
    const cov = computeCoverage(["a", "b", "c"], base());
    const milk = cov.find((l) => l.product_key === "milk")!;
    expect(milk.state).toBe("partial");
    expect(milk.presentCount).toBe(2);
  });

  it("flags mixedQty when present rows disagree on quantity", () => {
    const b = base();
    b.assignments.b = [{ product_key: "eggs", quantity: 5 }];
    b.assignments.c = [{ product_key: "eggs", quantity: 3 }];
    const cov = computeCoverage(["a", "b", "c"], b); // a:3, b:5, c:3
    const eggs = cov.find((l) => l.product_key === "eggs")!;
    expect(eggs.presentCount).toBe(3);
    expect(eggs.commonQty).toBeNull();
    expect(eggs.mixedQty).toBe(true);
  });

  it("orders lines deterministically by product_key", () => {
    const cov = computeCoverage(["a", "b", "c"], base());
    expect(cov.map((l) => l.product_key)).toEqual(["eggs", "milk", "pekmez"]);
  });
});

describe("applyLine", () => {
  it("sets a product+qty for every selected id, adding where missing", () => {
    const next = applyLine(base(), ["a", "b", "c"], { product_key: "milk", quantity: 1 });
    const cov = computeCoverage(["a", "b", "c"], next);
    const milk = cov.find((l) => l.product_key === "milk")!;
    expect(milk.state).toBe("all");
    expect(milk.commonQty).toBe(1);
  });

  it("overwrites an existing line's quantity (no duplicate)", () => {
    const next = applyLine(base(), ["a"], { product_key: "eggs", quantity: 10 });
    expect(next.assignments.a!.filter((l) => l.product_key === "eggs")).toHaveLength(1);
    expect(next.assignments.a!.find((l) => l.product_key === "eggs")!.quantity).toBe(10);
  });

  it("creates an assignment for an id not yet in the batch", () => {
    const next = applyLine(emptyBatch("2026-06-23"), ["z"], { product_key: "eggs", quantity: 2 });
    expect(next.assignments.z).toEqual([{ product_key: "eggs", quantity: 2 }]);
  });

  it("does not mutate the input batch", () => {
    const b = base();
    applyLine(b, ["a"], { product_key: "eggs", quantity: 99 });
    expect(b.assignments.a!.find((l) => l.product_key === "eggs")!.quantity).toBe(3);
  });
});

describe("removeLine", () => {
  it("removes a product from every selected id", () => {
    const next = removeLine(base(), ["a", "b", "c"], "eggs");
    const cov = computeCoverage(["a", "b", "c"], next);
    expect(cov.find((l) => l.product_key === "eggs")).toBeUndefined();
  });
});

describe("clearCustomers", () => {
  it("drops the given ids entirely from the batch", () => {
    const next = clearCustomers(base(), ["c"]);
    expect(next.assignments.c).toBeUndefined();
    expect(Object.keys(next.assignments).sort()).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run features/orders/domain/draft-batch.test.ts`
Expected: FAIL — cannot resolve `draft-batch`.

- [ ] **Step 3: Write minimal implementation**

```ts
// features/orders/domain/draft-batch.ts
import type { PaymentMethod, TimeSlot } from "@/features/orders/domain/order";

export interface BasketLine {
  product_key: string;
  quantity: number;
}

export interface DraftBatch {
  scheduledFor: string; // YYYY-MM-DD
  defaults: {
    timeSlot: TimeSlot | null;
    paymentMethod: PaymentMethod;
    deliveryFeeMinor: number;
  };
  assignments: Record<string, BasketLine[]>;
}

export interface CoverageLine {
  product_key: string;
  presentCount: number;
  total: number;
  state: "all" | "partial";
  commonQty: number | null;
  mixedQty: boolean;
}

export function emptyBatch(scheduledFor: string): DraftBatch {
  return {
    scheduledFor,
    defaults: { timeSlot: null, paymentMethod: "cash_on_delivery", deliveryFeeMinor: 0 },
    assignments: {},
  };
}

export function computeCoverage(
  selectedIds: readonly string[],
  batch: DraftBatch,
): CoverageLine[] {
  const n = selectedIds.length;
  if (n === 0) return [];

  const qtysByProduct = new Map<string, number[]>();
  for (const id of selectedIds) {
    const lines = batch.assignments[id] ?? [];
    for (const line of lines) {
      const arr = qtysByProduct.get(line.product_key) ?? [];
      arr.push(line.quantity);
      qtysByProduct.set(line.product_key, arr);
    }
  }

  const out: CoverageLine[] = [];
  for (const [product_key, qtys] of qtysByProduct) {
    const presentCount = qtys.length;
    const first = qtys[0]!;
    const allSame = qtys.every((q) => q === first);
    out.push({
      product_key,
      presentCount,
      total: n,
      state: presentCount === n ? "all" : "partial",
      commonQty: allSame ? first : null,
      mixedQty: !allSame,
    });
  }

  out.sort((a, b) =>
    a.product_key < b.product_key ? -1 : a.product_key > b.product_key ? 1 : 0,
  );
  return out;
}

export function applyLine(
  batch: DraftBatch,
  ids: readonly string[],
  line: BasketLine,
): DraftBatch {
  const assignments = { ...batch.assignments };
  for (const id of ids) {
    const current = assignments[id] ?? [];
    const without = current.filter((l) => l.product_key !== line.product_key);
    assignments[id] = [...without, { product_key: line.product_key, quantity: line.quantity }];
  }
  return { ...batch, assignments };
}

export function removeLine(
  batch: DraftBatch,
  ids: readonly string[],
  productKey: string,
): DraftBatch {
  const assignments = { ...batch.assignments };
  for (const id of ids) {
    const current = assignments[id];
    if (!current) continue;
    assignments[id] = current.filter((l) => l.product_key !== productKey);
  }
  return { ...batch, assignments };
}

export function clearCustomers(batch: DraftBatch, ids: readonly string[]): DraftBatch {
  const assignments = { ...batch.assignments };
  for (const id of ids) delete assignments[id];
  return { ...batch, assignments };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run features/orders/domain/draft-batch.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add features/orders/domain/draft-batch.ts features/orders/domain/draft-batch.test.ts
git commit -m "feat(orders): draft-batch domain — coverage + immutable reducers"
```

---

### Task 2: `draft-batch` persistence — Zod parse + prune (pure, TDD)

The localStorage read is an external boundary → Zod-parse it; discard corrupt/stale; prune product keys no longer in the catalog.

**Files:**
- Create: `features/orders/domain/draft-batch.schema.ts`
- Test: `features/orders/domain/draft-batch.schema.test.ts`

**Interfaces:**
- Consumes: `DraftBatch` from `./draft-batch`.
- Produces:
  - `DRAFT_BATCH_VERSION = 1`
  - `parseStoredBatch(raw: unknown): DraftBatch | null` — returns the batch when valid + current version, else `null`.
  - `pruneUnknownProducts(batch: DraftBatch, validKeys: ReadonlySet<string>): DraftBatch` — drops lines whose product_key isn't in `validKeys`.

- [ ] **Step 1: Write the failing test**

```ts
// features/orders/domain/draft-batch.schema.test.ts
import { describe, expect, it } from "vitest";

import { parseStoredBatch, pruneUnknownProducts } from "@/features/orders/domain/draft-batch.schema";

const stored = {
  version: 1,
  scheduledFor: "2026-06-23",
  defaults: { timeSlot: "morning", paymentMethod: "cash_on_delivery", deliveryFeeMinor: 0 },
  assignments: { a: [{ product_key: "eggs", quantity: 3 }] },
};

describe("parseStoredBatch", () => {
  it("parses a valid stored batch", () => {
    const b = parseStoredBatch(stored);
    expect(b).not.toBeNull();
    expect(b!.scheduledFor).toBe("2026-06-23");
    expect(b!.assignments.a).toEqual([{ product_key: "eggs", quantity: 3 }]);
  });

  it("returns null for a stale version", () => {
    expect(parseStoredBatch({ ...stored, version: 0 })).toBeNull();
  });

  it("returns null for corrupt/missing fields", () => {
    expect(parseStoredBatch(null)).toBeNull();
    expect(parseStoredBatch({ version: 1 })).toBeNull();
    expect(parseStoredBatch({ ...stored, scheduledFor: "23-06-2026" })).toBeNull();
  });
});

describe("pruneUnknownProducts", () => {
  it("drops lines whose product no longer exists", () => {
    const batch = parseStoredBatch({
      ...stored,
      assignments: {
        a: [
          { product_key: "eggs", quantity: 3 },
          { product_key: "gone", quantity: 1 },
        ],
      },
    })!;
    const pruned = pruneUnknownProducts(batch, new Set(["eggs", "milk"]));
    expect(pruned.assignments.a).toEqual([{ product_key: "eggs", quantity: 3 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run features/orders/domain/draft-batch.schema.test.ts`
Expected: FAIL — cannot resolve `draft-batch.schema`.

- [ ] **Step 3: Write minimal implementation**

```ts
// features/orders/domain/draft-batch.schema.ts
import { z } from "zod";

import type { DraftBatch } from "@/features/orders/domain/draft-batch";

export const DRAFT_BATCH_VERSION = 1;

const basketLineSchema = z.object({
  product_key: z.string().min(1),
  quantity: z.number().positive(),
});

const storedBatchSchema = z.object({
  version: z.literal(DRAFT_BATCH_VERSION),
  scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  defaults: z.object({
    timeSlot: z.enum(["morning", "afternoon", "evening"]).nullable(),
    paymentMethod: z.enum(["cash_on_delivery", "bank_transfer"]),
    deliveryFeeMinor: z.number().int().nonnegative(),
  }),
  assignments: z.record(z.string(), z.array(basketLineSchema)),
});

export function parseStoredBatch(raw: unknown): DraftBatch | null {
  const parsed = storedBatchSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { scheduledFor, defaults, assignments } = parsed.data;
  return { scheduledFor, defaults, assignments };
}

export function pruneUnknownProducts(
  batch: DraftBatch,
  validKeys: ReadonlySet<string>,
): DraftBatch {
  const assignments: Record<string, typeof batch.assignments[string]> = {};
  for (const [id, lines] of Object.entries(batch.assignments)) {
    assignments[id] = lines.filter((l) => validKeys.has(l.product_key));
  }
  return { ...batch, assignments };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run features/orders/domain/draft-batch.schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/orders/domain/draft-batch.schema.ts features/orders/domain/draft-batch.schema.test.ts
git commit -m "feat(orders): draft-batch localStorage Zod parse + product pruning"
```

---

### Task 3: `useDraftBatch` hook (localStorage persistence)

Mirrors the repo's `useColumnPrefs` pattern (hydrate-after-mount → SSR-safe; persist-on-change; try/catch). Verified by typecheck/lint.

**Files:**
- Create: `features/orders/ui/use-draft-batch.ts`

**Interfaces:**
- Consumes: `emptyBatch`, `applyLine`, `removeLine`, `clearCustomers`, types from `./draft-batch`; `parseStoredBatch` from `./draft-batch.schema`.
- Produces: `useDraftBatch(initialDate: string): { batch; setDate; setDefaults; apply; remove; clear; reset }` with operation signatures `apply(ids: string[], line: BasketLine)`, `remove(ids: string[], productKey: string)`, `clear(ids: string[])`, `setDefaults(defaults: DraftBatch["defaults"])`, `reset(date: string)`.

- [ ] **Step 1: Write the hook**

```ts
// features/orders/ui/use-draft-batch.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  applyLine,
  clearCustomers,
  emptyBatch,
  removeLine,
  type BasketLine,
  type DraftBatch,
} from "@/features/orders/domain/draft-batch";
import {
  DRAFT_BATCH_VERSION,
  parseStoredBatch,
} from "@/features/orders/domain/draft-batch.schema";

const STORAGE_KEY = "ts:bulk-order-draft:v1";

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function useDraftBatch(initialDate: string) {
  const [batch, setBatch] = useState<DraftBatch>(() => emptyBatch(initialDate));
  const hydrated = useRef(false);

  // Hydrate from localStorage after mount (SSR-safe).
  useEffect(() => {
    if (typeof window === "undefined") {
      hydrated.current = true;
      return;
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = parseStoredBatch(safeParseJson(raw));
      if (parsed) setBatch(parsed);
    }
    hydrated.current = true;
  }, []);

  // Persist on change (only after hydration, so we never clobber stored state).
  useEffect(() => {
    if (typeof window === "undefined" || !hydrated.current) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: DRAFT_BATCH_VERSION, ...batch }),
      );
    } catch {
      // Quota / private mode — drop silently.
    }
  }, [batch]);

  const setDate = useCallback(
    (scheduledFor: string) => setBatch((b) => ({ ...b, scheduledFor })),
    [],
  );
  const setDefaults = useCallback(
    (defaults: DraftBatch["defaults"]) => setBatch((b) => ({ ...b, defaults })),
    [],
  );
  const apply = useCallback(
    (ids: string[], line: BasketLine) => setBatch((b) => applyLine(b, ids, line)),
    [],
  );
  const remove = useCallback(
    (ids: string[], productKey: string) => setBatch((b) => removeLine(b, ids, productKey)),
    [],
  );
  const clear = useCallback(
    (ids: string[]) => setBatch((b) => clearCustomers(b, ids)),
    [],
  );
  const reset = useCallback((date: string) => setBatch(emptyBatch(date)), []);

  return { batch, setDate, setDefaults, apply, remove, clear, reset };
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add features/orders/ui/use-draft-batch.ts
git commit -m "feat(orders): useDraftBatch hook (localStorage-persisted draft)"
```

---

### Task 4: Customer picker queries (browse rows + all-filtered ids)

The picker browses customers without a search term and needs a known row contract + a way to select-all-filtered without loading every row into the grid. Verified by typecheck/lint.

**Files:**
- Create: `features/customers/application/list-customers-for-picker.ts`

**Interfaces:**
- Consumes: `listCustomers` from `@/features/customers/application/list-customers`; `CustomerSearchHit` from `@/features/customers/application/search-customers-action` (shape `{ id; name; phone; city: string | null }`); `logger`.
- Produces:
  - `interface PickerPage { items: CustomerSearchHit[]; total: number }`
  - `listCustomersForPicker(q: string, page: number, pageSize: number): Promise<PickerPage>`
  - `listAllCustomerIds(q: string): Promise<string[]>` (capped at 1000; logs if `total` exceeds the cap so no silent truncation).

- [ ] **Step 1: Write the module**

```ts
// features/customers/application/list-customers-for-picker.ts
"use server";

import type { CustomerSearchHit } from "@/features/customers/application/search-customers-action";
import { listCustomers } from "@/features/customers/application/list-customers";
import { logger } from "@/shared/logger";

const ALL_IDS_CAP = 1000;

export interface PickerPage {
  items: CustomerSearchHit[];
  total: number;
}

// Reuse the exact CustomerListItem -> CustomerSearchHit mapping already in
// search-customers-action.ts. If that mapping is not exported, copy it here
// verbatim (display name = first+last trimmed, phone formatted or "—", city).
function toHit(item: {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  city?: string | null;
}): CustomerSearchHit {
  const name = [item.first_name, item.last_name].filter(Boolean).join(" ").trim() || "(isimsiz)";
  return {
    id: item.id,
    name,
    phone: item.phone ?? "—",
    city: item.city ?? null,
  };
}

export async function listCustomersForPicker(
  q: string,
  page: number,
  pageSize: number,
): Promise<PickerPage> {
  const res = await listCustomers({ q, page, pageSize });
  if (!res.ok) return { items: [], total: 0 };
  // `res.value.items` are CustomerListItem; map with the shared transform.
  return {
    items: res.value.items.map((i) => toHit(i as never)),
    total: res.value.total,
  };
}

export async function listAllCustomerIds(q: string): Promise<string[]> {
  const res = await listCustomers({ q, page: 1, pageSize: ALL_IDS_CAP });
  if (!res.ok) return [];
  if (res.value.total > ALL_IDS_CAP) {
    logger.warn(
      { total: res.value.total, cap: ALL_IDS_CAP, q },
      "select_all_filtered_capped",
    );
  }
  return res.value.items.map((i) => i.id);
}
```

> When implementing `toHit`, open `features/customers/application/search-customers-action.ts` and `features/customers/domain/customer.ts` and match the real `CustomerListItem` field names + the existing name/phone formatting exactly (replace the `as never` cast once the field names are confirmed).

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add features/customers/application/list-customers-for-picker.ts
git commit -m "feat(customers): picker rows + select-all-filtered ids (capped 1000)"
```

---

### Task 5: `CustomerPickList` component (left side)

Controlled multi-select list with its own selection state (the DataGrid's row selection is internal/uncontrollable). Search, paginate, per-row mini-basket chips, `⚠ adres yok` badge, select-all-filtered. Verified by typecheck/lint + manual.

**Files:**
- Create: `features/orders/ui/customer-pick-list.tsx`

**Interfaces:**
- Consumes: `listCustomersForPicker`, `listAllCustomerIds` (Task 4); `getCustomersMissingPrimaryAddressAction` (Plan 1, Task 3); `DraftBatch` from `@/features/orders/domain/draft-batch`; `Product` from `@/features/products/application/list-products`; `Button`, `Input`, `Badge` from `@/components/ui/*`.
- Produces: `CustomerPickList(props: { batch: DraftBatch; productsByKey: Map<string, Product>; selectedIds: ReadonlySet<string>; onSelectionChange: (ids: ReadonlySet<string>) => void })`.

- [ ] **Step 1: Write the component**

```tsx
// features/orders/ui/customer-pick-list.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

import { getCustomersMissingPrimaryAddressAction } from "@/features/customers/application/customer-price-actions";
import {
  listAllCustomerIds,
  listCustomersForPicker,
} from "@/features/customers/application/list-customers-for-picker";
import type { CustomerSearchHit } from "@/features/customers/application/search-customers-action";
import type { DraftBatch } from "@/features/orders/domain/draft-batch";
import type { Product } from "@/features/products/application/list-products";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PAGE_SIZE = 25;

interface Props {
  batch: DraftBatch;
  productsByKey: Map<string, Product>;
  selectedIds: ReadonlySet<string>;
  onSelectionChange: (ids: ReadonlySet<string>) => void;
}

export function CustomerPickList({
  batch,
  productsByKey,
  selectedIds,
  onSelectionChange,
}: Props) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CustomerSearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Debounced fetch on q/page change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await listCustomersForPicker(q.trim(), page, PAGE_SIZE);
      if (cancelled) return;
      setRows(res.items);
      setTotal(res.total);
      setLoading(false);
      const miss = await getCustomersMissingPrimaryAddressAction(res.items.map((r) => r.id));
      if (!cancelled) setMissing(new Set(miss));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, page]);

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectionChange(next);
  };

  const selectAllFiltered = async () => {
    const ids = await listAllCustomerIds(q.trim());
    onSelectionChange(new Set(ids));
  };

  const chips = (id: string) => {
    const lines = batch.assignments[id] ?? [];
    if (lines.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <span className="flex flex-wrap gap-1">
        {lines.map((l) => {
          const p = productsByKey.get(l.product_key);
          return (
            <Badge key={l.product_key} variant="secondary" className="text-[10px]">
              {(p?.display_name ?? l.product_key)} ×{l.quantity}
            </Badge>
          );
        })}
      </span>
    );
  };

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Müşteri ara (isim / telefon)…"
          className="h-8"
        />
        <Button type="button" variant="outline" size="sm" onClick={selectAllFiltered}>
          Tümünü seç
        </Button>
        {selectedIds.size > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSelectionChange(new Set())}
          >
            Temizle ({selectedIds.size})
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto rounded-md border">
        {loading && <p className="p-3 text-sm text-muted-foreground">Yükleniyor…</p>}
        {!loading &&
          rows.map((r) => (
            <label
              key={r.id}
              className="flex items-center gap-2 border-b px-2 py-1.5 text-sm last:border-b-0 hover:bg-muted/50"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(r.id)}
                onChange={(e) => toggle(r.id, e.target.checked)}
                className="size-4"
              />
              <span className="w-40 shrink-0 truncate font-medium">{r.name}</span>
              {missing.has(r.id) && (
                <Badge variant="destructive" className="text-[10px]">
                  ⚠ adres yok
                </Badge>
              )}
              <span className="ml-auto">{chips(r.id)}</span>
            </label>
          ))}
        {!loading && rows.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">Sonuç yok.</p>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {total} müşteri • {selectedIds.size} seçili
        </span>
        <span className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ‹
          </Button>
          {page}/{pageCount}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            ›
          </Button>
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. (If `Badge`/`Input` variants differ, adjust to the actual prop names in `components/ui/`.)

- [ ] **Step 3: Commit**

```bash
git add features/orders/ui/customer-pick-list.tsx
git commit -m "feat(orders): controlled customer pick-list (search, select-all, address badge)"
```

---

### Task 6: `BasketPanel` + `CoverageLineRow` (right side)

Shows coverage for the current selection, lets you add a product / set qty (step-enforced) and `uygula`/`kaldır` to the whole selection, plus a live estimate. Verified by typecheck/lint + manual.

**Files:**
- Create: `features/orders/ui/basket-panel.tsx`

**Interfaces:**
- Consumes: `computeCoverage`, `type CoverageLine`, `type BasketLine` from `@/features/orders/domain/draft-batch`; `isMultipleOfStep` from `@/features/orders/application/order-item-pricing`; `priceOrderLine` from `@/features/products/domain/product-pricing`; `Product` from `@/features/products/application/list-products`; `formatTRY` from `@/shared/utils/money`; `Badge`, `Button`, `Input`, `Select` (+ parts), `Separator`.
- Produces: `BasketPanel(props: { batch: DraftBatch; products: Product[]; selectedIds: string[]; onApply: (line: BasketLine) => void; onRemove: (productKey: string) => void })`.

- [ ] **Step 1: Write the component**

```tsx
// features/orders/ui/basket-panel.tsx
"use client";

import { useMemo, useState } from "react";

import { isMultipleOfStep } from "@/features/orders/application/order-item-pricing";
import {
  computeCoverage,
  type BasketLine,
  type CoverageLine,
  type DraftBatch,
} from "@/features/orders/domain/draft-batch";
import { priceOrderLine } from "@/features/products/domain/product-pricing";
import type { Product } from "@/features/products/application/list-products";
import { formatTRY } from "@/shared/utils/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

interface Props {
  batch: DraftBatch;
  products: Product[];
  selectedIds: string[];
  onApply: (line: BasketLine) => void;
  onRemove: (productKey: string) => void;
}

function badgeFor(line: CoverageLine): { label: string; variant: "default" | "secondary" | "outline" } {
  if (line.state === "all") {
    return line.mixedQty
      ? { label: `${line.presentCount}/${line.total} ✓ ~`, variant: "secondary" }
      : { label: `${line.presentCount}/${line.total} ✓`, variant: "default" };
  }
  return { label: `${line.presentCount}/${line.total} ◑`, variant: "outline" };
}

export function BasketPanel({ batch, products, selectedIds, onApply, onRemove }: Props) {
  const productsByKey = useMemo(() => new Map(products.map((p) => [p.key, p])), [products]);
  const coverage = useMemo(
    () => computeCoverage(selectedIds, batch),
    [selectedIds, batch],
  );

  const n = selectedIds.length;

  // Live estimate: sum each selected customer's lines at catalog prices.
  const estimateMinor = useMemo(() => {
    let total = 0;
    for (const id of selectedIds) {
      for (const line of batch.assignments[id] ?? []) {
        const p = productsByKey.get(line.product_key);
        if (!p) continue;
        total += priceOrderLine(line.quantity, {
          tiers: p.price_tiers,
          basePriceMinor: p.current_unit_price_minor,
        }).line_total_minor;
      }
    }
    return total;
  }, [selectedIds, batch, productsByKey]);

  if (n === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Soldan müşteri seç — ortak sepet burada görünecek.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="text-sm font-medium">Ortak sepet · {n} müşteri seçili</div>
      <Separator />

      <div className="flex-1 space-y-1 overflow-auto">
        {coverage.length === 0 && (
          <p className="text-sm text-muted-foreground">Sepet boş. Aşağıdan ürün ekle.</p>
        )}
        {coverage.map((line) => {
          const p = productsByKey.get(line.product_key);
          const b = badgeFor(line);
          return (
            <div
              key={line.product_key}
              className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50"
            >
              <span className="w-28 shrink-0 truncate">{p?.display_name ?? line.product_key}</span>
              <span className="text-muted-foreground">
                ×{line.commonQty ?? "—"}
              </span>
              <Badge variant={b.variant} className="ml-auto text-[10px]">
                {b.label}
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onRemove(line.product_key)}
              >
                kaldır
              </Button>
            </div>
          );
        })}
      </div>

      <Separator />
      <AddProductRow products={products} onApply={onApply} count={n} />

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{n} sipariş · tahmini</span>
        <span className="font-mono font-semibold">{formatTRY(estimateMinor)}</span>
      </div>
    </div>
  );
}

function AddProductRow({
  products,
  onApply,
  count,
}: {
  products: Product[];
  onApply: (line: BasketLine) => void;
  count: number;
}) {
  const [productKey, setProductKey] = useState<string>(products[0]?.key ?? "");
  const product = products.find((p) => p.key === productKey);
  const [qtyText, setQtyText] = useState<string>(() => String(products[0]?.min_qty ?? 1));
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    if (!product) return;
    const qty = Number(qtyText.replace(",", "."));
    if (!Number.isFinite(qty) || qty < product.min_qty) {
      setError(`En az ${product.min_qty} ${product.unit_label}.`);
      return;
    }
    if (!isMultipleOfStep(qty, product.step)) {
      setError(`Miktar ${product.step} ${product.unit_label} katı olmalı.`);
      return;
    }
    setError(null);
    onApply({ product_key: product.key, quantity: qty });
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <select
          value={productKey}
          onChange={(e) => {
            setProductKey(e.target.value);
            const p = products.find((x) => x.key === e.target.value);
            if (p) setQtyText(String(p.min_qty));
          }}
          className="h-8 flex-1 rounded-md border bg-background px-2 text-sm"
        >
          {products.map((p) => (
            <option key={p.key} value={p.key}>
              {p.display_name}
            </option>
          ))}
        </select>
        <Input
          value={qtyText}
          onChange={(e) => setQtyText(e.target.value)}
          inputMode="decimal"
          className="h-8 w-20"
        />
        <Button type="button" size="sm" onClick={apply}>
          {count}&apos;e uygula
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

> A native `<select>` is used because `components/ui/` has no `Checkbox`/no guaranteed `Select` ergonomics for this; if the repo's `Select` (Radix) is preferred, swap it in — the logic is unchanged.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add features/orders/ui/basket-panel.tsx
git commit -m "feat(orders): basket panel with coverage badges + step-checked apply/remove"
```

---

### Task 7: `BulkOrderScreen` orchestrator + commit

Top bar (date / time-slot / payment), left list, right panel, bottom bar (estimate + missing-address pre-flight + commit). Commits via `createOrdersBulkAction`; clears the draft on success. Verified by typecheck/lint + manual.

**Files:**
- Create: `features/orders/ui/bulk-order-screen.tsx`

**Interfaces:**
- Consumes: `useDraftBatch` (Task 3); `CustomerPickList` (Task 5); `BasketPanel` (Task 6); `createOrdersBulkAction`, `type CreateOrdersBulkState` (Plan 1, Task 6); `getCustomersMissingPrimaryAddressAction` (Plan 1, Task 3); `Product`; `Button`, `Input`, `Separator`; `useRouter` (next/navigation); `toast` (sonner); `useTransition`.
- Produces: `BulkOrderScreen(props: { products: Product[]; today: string })`.

- [ ] **Step 1: Write the component**

```tsx
// features/orders/ui/bulk-order-screen.tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { getCustomersMissingPrimaryAddressAction } from "@/features/customers/application/customer-price-actions";
import {
  createOrdersBulkAction,
  type CreateOrdersBulkState,
} from "@/features/orders/application/create-orders-bulk";
import { BasketPanel } from "@/features/orders/ui/basket-panel";
import { CustomerPickList } from "@/features/orders/ui/customer-pick-list";
import { useDraftBatch } from "@/features/orders/ui/use-draft-batch";
import type { Product } from "@/features/products/application/list-products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

interface Props {
  products: Product[];
  today: string;
}

const SLOTS: Array<{ value: string; label: string }> = [
  { value: "none", label: "Saat farketmez" },
  { value: "morning", label: "Öğleden önce" },
  { value: "afternoon", label: "Öğleden sonra" },
  { value: "evening", label: "Akşam" },
];

export function BulkOrderScreen({ products, today }: Props) {
  const router = useRouter();
  const { batch, setDate, setDefaults, apply, remove, reset } = useDraftBatch(today);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [missing, setMissing] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const productsByKey = useMemo(
    () => new Map(products.map((p) => [p.key, p])),
    [products],
  );

  const orderCount = useMemo(
    () =>
      Object.entries(batch.assignments).filter(([, lines]) => lines.length > 0).length,
    [batch],
  );

  const selectedArray = useMemo(() => Array.from(selectedIds), [selectedIds]);

  const commit = () => {
    // Build the bulkOrderSchema-shaped payload from non-empty assignments.
    const orders = Object.entries(batch.assignments)
      .filter(([, lines]) => lines.length > 0)
      .map(([customer_id, lines]) => ({
        customer_id,
        items: lines.map((l) => ({ product_key: l.product_key, quantity: l.quantity })),
      }));

    if (orders.length === 0) {
      toast.error("En az bir müşteriye ürün ekle.");
      return;
    }

    startTransition(async () => {
      // Pre-flight: address-less customers among the batch.
      const miss = await getCustomersMissingPrimaryAddressAction(orders.map((o) => o.customer_id));
      if (miss.length > 0) {
        setMissing(miss);
        toast.error(`${miss.length} müşteride adres yok. Önce adres ekle ya da çıkar.`);
        return;
      }

      const payload = {
        scheduled_for: batch.scheduledFor,
        time_slot: batch.defaults.timeSlot,
        payment_method: batch.defaults.paymentMethod,
        delivery_fee_minor: batch.defaults.deliveryFeeMinor,
        orders,
      };
      const fd = new FormData();
      fd.set("batch_json", JSON.stringify(payload));

      const initial: CreateOrdersBulkState = { status: "idle" };
      const result = await createOrdersBulkAction(initial, fd);
      switch (result.status) {
        case "success":
          toast.success(`${result.created} sipariş oluşturuldu.`);
          reset(today);
          setSelectedIds(new Set());
          router.push("/orders");
          router.refresh();
          return;
        case "missing_address":
          setMissing(result.customerIds);
          toast.error(`${result.customerIds.length} müşteride adres yok.`);
          return;
        case "validation_error":
          toast.error(Object.values(result.fieldErrors).flat()[0] ?? "Geçersiz sepet.");
          return;
        case "error":
          toast.error(result.message);
          return;
      }
    });
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-2">
      {/* Top bar: date / slot / payment (batch defaults) */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border p-2 text-sm">
        <label className="flex items-center gap-1">
          Teslim:
          <Input
            type="date"
            value={batch.scheduledFor}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 w-40"
          />
        </label>
        <label className="flex items-center gap-1">
          Saat:
          <select
            value={batch.defaults.timeSlot ?? "none"}
            onChange={(e) =>
              setDefaults({
                ...batch.defaults,
                timeSlot: e.target.value === "none" ? null : (e.target.value as "morning" | "afternoon" | "evening"),
              })
            }
            className="h-8 rounded-md border bg-background px-2"
          >
            {SLOTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          Ödeme:
          <select
            value={batch.defaults.paymentMethod}
            onChange={(e) =>
              setDefaults({
                ...batch.defaults,
                paymentMethod: e.target.value as "cash_on_delivery" | "bank_transfer",
              })
            }
            className="h-8 rounded-md border bg-background px-2"
          >
            <option value="cash_on_delivery">Kapıda nakit</option>
            <option value="bank_transfer">Havale / EFT</option>
          </select>
        </label>
      </div>

      {/* Body: left list | right panel */}
      <div className="grid flex-1 grid-cols-1 gap-2 overflow-hidden md:grid-cols-[1.4fr_1fr]">
        <div className="overflow-hidden rounded-md border p-2">
          <CustomerPickList
            batch={batch}
            productsByKey={productsByKey}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
        </div>
        <div className="overflow-hidden rounded-md border">
          <BasketPanel
            batch={batch}
            products={products}
            selectedIds={selectedArray}
            onApply={(line) => apply(selectedArray, line)}
            onRemove={(key) => remove(selectedArray, key)}
          />
        </div>
      </div>

      {/* Bottom bar: summary + commit */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
        <span>
          {orderCount} sipariş hazır
          {missing.length > 0 && (
            <span className="ml-2 text-destructive">
              · ⚠ {missing.length} müşteride adres yok
            </span>
          )}
        </span>
        <Button type="button" onClick={commit} disabled={pending || orderCount === 0}>
          {pending ? "Oluşturuluyor…" : "Siparişleri Oluştur"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add features/orders/ui/bulk-order-screen.tsx
git commit -m "feat(orders): bulk order screen orchestrator + atomic commit"
```

---

### Task 8: Wire `/orders/new` to the bulk screen + retire `OrderForm`

The bulk screen replaces the single-order form (n=1 = select one row). Verified by typecheck/lint + a full build + manual run.

**Files:**
- Modify: `app/(admin)/orders/new/page.tsx`
- Delete: `features/orders/ui/order-form.tsx` (and `product-picker.tsx`, `customer-typeahead.tsx` **iff** nothing else imports them — confirm with grep)

**Interfaces:**
- Consumes: `listActiveProducts`, `BulkOrderScreen` (Task 7), `toIstanbulDateString` (`@/shared/utils/date`).

- [ ] **Step 1: Replace the page**

```tsx
// app/(admin)/orders/new/page.tsx
import Link from "next/link";

import { BulkOrderScreen } from "@/features/orders/ui/bulk-order-screen";
import { listActiveProducts } from "@/features/products/application/list-products";
import { toIstanbulDateString } from "@/shared/utils/date";

export default async function NewOrderPage() {
  const productsResult = await listActiveProducts();
  if (!productsResult.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Ürün katalogu yüklenemedi: {productsResult.error.message}
      </div>
    );
  }

  const today = toIstanbulDateString(new Date());

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href="/orders" className="hover:underline">
            ← Siparişler
          </Link>
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">Sipariş Oluştur</h2>
        <p className="text-sm text-muted-foreground">
          Soldan müşterileri seç, sağdan ortak sepeti kur, topluca oluştur.
        </p>
      </div>

      <BulkOrderScreen products={productsResult.value} today={today} />
    </div>
  );
}
```

- [ ] **Step 2: Confirm no other importers, then retire the old form**

Run: `git grep -n "order-form\|product-picker\|customer-typeahead" -- 'features' 'app'`
Expected: only the three files referencing each other. If so:

```bash
git rm features/orders/ui/order-form.tsx features/orders/ui/product-picker.tsx features/orders/ui/customer-typeahead.tsx
```
If `product-picker.tsx` / `customer-typeahead.tsx` are imported elsewhere, keep them and delete only `order-form.tsx`.

- [ ] **Step 3: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green. Then `pnpm dev` and manually walk the spec §3.4 scenario (date → select-all → eggs → narrow → milk → mixed selection shows coverage → commit).

- [ ] **Step 4: Commit**

```bash
git add app/(admin)/orders/new/page.tsx features/orders/ui/
git commit -m "feat(orders): /orders/new is now the bulk basket×customer screen; retire single-order form"
```

---

## Self-Review

**Spec coverage:**
- §3.1 split-screen anatomy (top bar, left list, right panel, bottom bar) → Task 7. ✅
- §3.2 coverage badges (`n/n ✓`, `n/n ✓ ~`, `k/n ◑`) → Task 1 (`computeCoverage`) + Task 6 (`badgeFor`). ✅
- §3.3 two edit verbs `uygula`/`kaldır`, 0.5 step → Task 6 (`AddProductRow` uses `isMultipleOfStep`) + Task 1 reducers. ✅
- §3.4 worked scenario → Task 8 Step 3 manual walk. ✅
- §4.2 pure domain (coverage + reducers) → Task 1; §4.3 localStorage behind parse → Task 2 (Zod) + Task 3 (hook). ✅
- §4.5 select-all-filtered via ids-only/ capped query, paginated list → Task 4 + Task 5. ✅
- §4.6 `⚠ adres yok` badge + pre-flight → Task 5 (badge) + Task 7 (commit pre-flight, reuses Plan 1 Task 3). ✅
- §5 coverage/reducers tests + localStorage Zod parse test → Task 1 + Task 2. ✅
- §1.6/§6 retire single-order form → Task 8. ✅

**Deferred from spec (logged, not silent):**
- §4.6 `📦 bu tarihte zaten sipariş var` badge — **not built in v1**; noted here as a fast-follow (needs an orders-on-date batch query). It is a warning, not a commit guard; the bulk path already allows intentional duplicates.
- §4.6 inline pin-corrector for `⚠ adres yok` — v1 surfaces the missing-address list and blocks commit; fixing is done via the existing customer detail. Reusing `AddressPinCorrector` inline (needs a standalone save-address action + `APIProvider` wiring) is a fast-follow.
Both are scoped out deliberately to keep this plan shippable; neither weakens correctness (commit still pre-flights addresses and is atomic).

**Placeholder scan:** No "TBD"/"add validation"/"similar to". The one `as never` cast (Task 4) is flagged with an explicit instruction to replace it after confirming `CustomerListItem` field names — it's a typed bridge, not a logic gap.

**Type consistency:** `DraftBatch`/`BasketLine`/`CoverageLine` (Task 1) flow through Tasks 3/5/6/7. `computeCoverage(selectedIds, batch)` arg order matches all call sites. `CreateOrdersBulkState` statuses handled in Task 7 exactly match Plan 1 Task 6's union (`success`/`missing_address`/`validation_error`/`error`). The committed payload matches Plan 1's `bulkOrderSchema` (`scheduled_for`, `time_slot`, `payment_method`, `delivery_fee_minor`, `orders:[{customer_id, items:[{product_key, quantity}]}]`). ✅
