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
