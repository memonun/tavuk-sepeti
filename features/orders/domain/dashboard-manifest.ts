/**
 * Admin Panel prep manifest — what needs to leave the building: today's route
 * (delivery-channel) orders, plus the cargo backlog (cargo has no "today", it
 * ships whenever it's packed — see features/cargo's own queue).
 *
 * Route and cargo totals are kept SEPARATE on purpose. A cargo order that has
 * sat unshipped for a week keeps showing up in the backlog every single day
 * until it ships — folding its money/count into one "today" figure alongside
 * the route (which genuinely resets every day) would silently inflate
 * "today's revenue" with stale orders and make the panel lie about how much
 * is actually new today. The per-product prep LIST still combines both,
 * because physically both go out the same day regardless of which bucket
 * they're counted in — that part is legitimately "what do I prepare today".
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
  readonly order_number: string;
  readonly customer_name: string;
  readonly total_minor: number;
  readonly amount_paid_minor: number;
  readonly items: readonly DashboardManifestItem[];
}

/** Order count + money for one scope (today's route, or the cargo backlog). */
export interface DashboardManifestTotals {
  readonly orderCount: number;
  /** Sum of every in-scope order's total (kuruş). */
  readonly totalValueMinor: number;
  /** Outstanding balance across those orders (kuruş) — what's still to be
   *  collected (cash on delivery, unpaid havale/EFT). */
  readonly toCollectMinor: number;
}

export interface DashboardManifest {
  readonly lines: readonly DashboardManifestLine[];
  /** Today's route orders only — resets daily, a genuine "today" figure. */
  readonly route: DashboardManifestTotals;
  /** The cargo backlog — NOT date-scoped. Kept apart from `route` so a
   *  days-old unshipped order never gets counted as today's business. */
  readonly cargo: DashboardManifestTotals;
  /** The individual orders behind `route`, oldest first — what the "Bugünkü
   *  rota" list panel renders. */
  readonly routeOrders: readonly DashboardManifestOrder[];
  /** The individual orders behind `cargo`, oldest first — what the "Bekleyen
   *  kargo" list panel renders. */
  readonly cargoOrders: readonly DashboardManifestOrder[];
}

function aggregateLines(
  orders: readonly DashboardManifestOrder[],
): DashboardManifestLine[] {
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
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, "tr"));
}

function totalsOf(orders: readonly DashboardManifestOrder[]): DashboardManifestTotals {
  return {
    orderCount: orders.length,
    totalValueMinor: orders.reduce((sum, o) => sum + o.total_minor, 0),
    toCollectMinor: orders.reduce(
      (sum, o) => sum + Math.max(0, o.total_minor - o.amount_paid_minor),
      0,
    ),
  };
}

export function computeDashboardManifest(
  routeOrders: readonly DashboardManifestOrder[],
  cargoOrders: readonly DashboardManifestOrder[],
): DashboardManifest {
  return {
    lines: aggregateLines([...routeOrders, ...cargoOrders]),
    route: totalsOf(routeOrders),
    cargo: totalsOf(cargoOrders),
    routeOrders,
    cargoOrders,
  };
}
