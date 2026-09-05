/**
 * Admin Panel prep manifest — what needs to leave the building today: today's
 * route (delivery-channel) orders plus the whole cargo backlog (cargo has no
 * "today", it ships whenever it's packed — see features/cargo's own queue).
 *
 * Same aggregation as features/cargo/domain/cargo-manifest.ts and
 * features/routing/domain/route-manifest.ts's aggregateLines(), reimplemented
 * here rather than imported: domain/ may only import its own feature's
 * domain + shared (CLAUDE.md §2 / eslint-plugin-boundaries).
 */

export interface DashboardManifestItem {
  readonly label: string;
  readonly unit_label: string;
  readonly quantity: number;
}

/** One aggregated product line across every order in scope. */
export interface DashboardManifestLine {
  readonly label: string;
  readonly unit_label: string;
  readonly quantity: number;
}

export interface DashboardManifestOrder {
  readonly order_id: string;
  readonly total_minor: number;
  readonly amount_paid_minor: number;
  readonly items: readonly DashboardManifestItem[];
}

export interface DashboardManifest {
  readonly lines: readonly DashboardManifestLine[];
  readonly orderCount: number;
  /** Sum of every in-scope order's total (kuruş) — today's expected revenue. */
  readonly totalValueMinor: number;
  /** Outstanding balance across those orders (kuruş) — what's still to be
   *  collected (cash on delivery, unpaid havale/EFT). */
  readonly toCollectMinor: number;
}

export function computeDashboardManifest(
  orders: readonly DashboardManifestOrder[],
): DashboardManifest {
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
    toCollectMinor: orders.reduce(
      (sum, o) => sum + Math.max(0, o.total_minor - o.amount_paid_minor),
      0,
    ),
  };
}
