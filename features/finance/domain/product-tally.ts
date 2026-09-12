/**
 * Ürün Çetelesi — sold vs. gifted product quantities for a date range.
 * Backed by the product_tally() RPC (supabase/migrations/20260912120000),
 * which returns one row per (product, kind, unit_label). This module folds
 * that flat list into one row per product for the report table.
 *
 * A product can have more than one gift line (e.g. gifted in both "gr" and
 * "adet" within the same period) — never silently summed together, since
 * they're different units. Sold quantities don't have this problem: a
 * product's sold unit is always its own canonical unit_label.
 */
export interface ProductTallyUnitQuantity {
  readonly unit_label: string;
  readonly quantity: number;
}

export interface ProductTallyRow {
  readonly product_key: string;
  readonly display_name: string;
  readonly sold: ProductTallyUnitQuantity | null;
  readonly gifted: ReadonlyArray<ProductTallyUnitQuantity>;
}

/** Raw shape of one product_tally() RPC row. */
export interface ProductTallyRpcRow {
  readonly product_key: string;
  readonly display_name: string;
  readonly kind: "sold" | "gift";
  readonly unit_label: string;
  readonly quantity: number;
}

/** Fold the RPC's flat (product, kind, unit_label) rows into one row per
 *  product, sorted by display_name. Pure — the repository does the I/O. */
export function buildProductTallyRows(
  rpcRows: ReadonlyArray<ProductTallyRpcRow>,
): ProductTallyRow[] {
  const byProduct = new Map<string, ProductTallyRow>();

  for (const row of rpcRows) {
    const existing = byProduct.get(row.product_key) ?? {
      product_key: row.product_key,
      display_name: row.display_name,
      sold: null,
      gifted: [],
    };

    if (row.kind === "sold") {
      byProduct.set(row.product_key, {
        ...existing,
        sold: { unit_label: row.unit_label, quantity: row.quantity },
      });
    } else {
      byProduct.set(row.product_key, {
        ...existing,
        gifted: [...existing.gifted, { unit_label: row.unit_label, quantity: row.quantity }],
      });
    }
  }

  return [...byProduct.values()].sort((a, b) => a.display_name.localeCompare(b.display_name, "tr"));
}

// ---- Chart grouping ---------------------------------------------------------
//
// A bar chart's length only means something when every bar shares one unit —
// "12 kg" and "20 adet" can't share an axis. Both chart-data builders below
// group by unit_label first, so a chart never mixes units on one scale (the
// table above stays the ungrouped, per-product view for when unit mixing
// doesn't matter because nothing is being visually compared).

export interface ProductTallyChartRow {
  readonly product_key: string;
  readonly display_name: string;
  readonly quantity: number;
}

export interface ProductTallyChartGroup {
  readonly unit_label: string;
  /** Descending by quantity — the chart reads as a ranking. */
  readonly rows: ReadonlyArray<ProductTallyChartRow>;
}

interface FlatQuantity {
  readonly product_key: string;
  readonly display_name: string;
  readonly unit_label: string;
  readonly quantity: number;
}

function groupByUnit(entries: ReadonlyArray<FlatQuantity>): ProductTallyChartGroup[] {
  const byUnit = new Map<string, ProductTallyChartRow[]>();
  for (const e of entries) {
    const list = byUnit.get(e.unit_label) ?? [];
    list.push({ product_key: e.product_key, display_name: e.display_name, quantity: e.quantity });
    byUnit.set(e.unit_label, list);
  }
  return [...byUnit.entries()]
    .map(([unit_label, rows]) => ({
      unit_label,
      rows: [...rows].sort((a, b) => b.quantity - a.quantity),
    }))
    .sort((a, b) => b.rows.length - a.rows.length || a.unit_label.localeCompare(b.unit_label, "tr"));
}

/** One bar-chart group per sold unit_label, ranked by quantity within it. */
export function groupSoldByUnit(rows: ReadonlyArray<ProductTallyRow>): ProductTallyChartGroup[] {
  const entries: FlatQuantity[] = [];
  for (const r of rows) {
    if (r.sold) {
      entries.push({
        product_key: r.product_key,
        display_name: r.display_name,
        unit_label: r.sold.unit_label,
        quantity: r.sold.quantity,
      });
    }
  }
  return groupByUnit(entries);
}

/** Same as groupSoldByUnit, for gift quantities — a product with gifts in
 *  two different units contributes one entry to each of two groups. */
export function groupGiftedByUnit(rows: ReadonlyArray<ProductTallyRow>): ProductTallyChartGroup[] {
  const entries: FlatQuantity[] = [];
  for (const r of rows) {
    for (const g of r.gifted) {
      entries.push({
        product_key: r.product_key,
        display_name: r.display_name,
        unit_label: g.unit_label,
        quantity: g.quantity,
      });
    }
  }
  return groupByUnit(entries);
}
