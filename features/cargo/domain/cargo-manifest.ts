/**
 * Cargo prep manifest — total quantity of each product to pack across every
 * confirmed shipping-channel order waiting to go out. Pure aggregation over
 * an already-fetched item list, same algorithm as
 * features/routing/domain/route-manifest.ts's aggregateLines(), reimplemented
 * here rather than imported: domain/ may only import its own feature's
 * domain + shared (CLAUDE.md §2 / eslint-plugin-boundaries), and cargo has
 * no "delivered vs remaining" split routing needs (every order in the queue
 * still needs prep), so the shape is simpler.
 */

export interface CargoManifestItem {
  readonly label: string;
  readonly unit_label: string;
  readonly quantity: number;
}

/** One aggregated product line across all orders in the queue. */
export interface CargoManifestLine {
  readonly label: string;
  readonly unit_label: string;
  readonly quantity: number;
}

export interface CargoOrderForManifest {
  readonly order_id: string;
  readonly total_minor: number;
  readonly items: readonly CargoManifestItem[];
}

export interface CargoManifest {
  readonly lines: readonly CargoManifestLine[];
  readonly orderCount: number;
  readonly totalValueMinor: number;
}

export function computeCargoManifest(
  orders: readonly CargoOrderForManifest[],
): CargoManifest {
  const byKey = new Map<string, { label: string; unit_label: string; quantity: number }>();
  for (const order of orders) {
    for (const item of order.items) {
      // Same product name + unit aggregate together; " " can't collide with
      // real label text.
      const key = `${item.label} ${item.unit_label}`;
      const existing = byKey.get(key);
      if (existing) existing.quantity += item.quantity;
      else byKey.set(key, { label: item.label, unit_label: item.unit_label, quantity: item.quantity });
    }
  }

  return {
    lines: [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, "tr")),
    orderCount: orders.length,
    totalValueMinor: orders.reduce((sum, o) => sum + o.total_minor, 0),
  };
}
