import { getDayOrders } from "@/features/routing/application/get-day-orders";
import { getDayRoute } from "@/features/routing/application/get-day-route";
import { RouteControls } from "@/features/routing/ui/route-controls";
import { RouteList } from "@/features/routing/ui/route-list";
import { RouteMap } from "@/features/routing/ui/route-map";
import { env } from "@/shared/env";
import { formatLongDate, toIstanbulDateString } from "@/shared/utils/date";

interface RoutesPageProps {
  searchParams: Promise<{ date?: string; optimize?: string }>;
}

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  const rem = m - h * 60;
  return rem === 0 ? `${h} sa` : `${h} sa ${rem} dk`;
}

export default async function RoutesPage({ searchParams }: RoutesPageProps) {
  const params = await searchParams;
  const date =
    params.date && isYmd(params.date)
      ? params.date
      : toIstanbulDateString(new Date());
  const wantsOptimize = params.optimize === "1";

  const mapsKey = env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  const warehouseLat = env.WAREHOUSE_LAT;
  const warehouseLng = env.WAREHOUSE_LNG;
  const warehouseConfigured =
    warehouseLat !== undefined && warehouseLng !== undefined;

  // Always fetch the day's orders for the list/header counts. If the user
  // has clicked Optimize, run that too — separate fetches keep the UI
  // robust when Google fails (we still show the unoptimized list).
  const ordersResult = await getDayOrders(date);
  if (!ordersResult.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Sipariş listesi yüklenemedi: {ordersResult.error.message}
      </div>
    );
  }
  const dayOrders = ordersResult.value;

  const routeResult =
    wantsOptimize && warehouseConfigured && dayOrders.length > 0
      ? await getDayRoute(date)
      : null;
  const optimized = routeResult?.ok ? routeResult.value : null;
  const optimizeError =
    routeResult && !routeResult.ok ? routeResult.error.message : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Rota</h2>
          <p className="text-sm text-muted-foreground">
            {formatLongDate(date)} — {dayOrders.length} sipariş
            {optimized
              ? ` · ${formatDistance(optimized.total_distance_m)} · ${formatDuration(optimized.total_duration_s)}`
              : ""}
          </p>
        </div>
      </div>

      <RouteControls
        date={date}
        optimized={!!optimized}
        hasOrders={dayOrders.length > 0}
      />

      {!warehouseConfigured ? (
        <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm text-orange-700 dark:text-orange-300">
          Depo koordinatları .env&apos;de eksik. WAREHOUSE_LAT ve WAREHOUSE_LNG
          değerleri olmadan rota optimize edilemez.
        </div>
      ) : null}

      {optimizeError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Optimizasyon başarısız: {optimizeError}
        </div>
      ) : null}

      {optimized && mapsKey ? (
        <RouteMap
          apiKey={mapsKey}
          origin={optimized.origin}
          stops={optimized.stops}
          overviewPolyline={optimized.overview_polyline}
        />
      ) : null}

      <RouteList
        rows={
          optimized
            ? { kind: "optimized", stops: optimized.stops }
            : { kind: "unoptimized", orders: dayOrders }
        }
      />
    </div>
  );
}
