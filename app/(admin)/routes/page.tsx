import { getDayOrders } from "@/features/routing/application/get-day-orders";
import { getDayRoute } from "@/features/routing/application/get-day-route";
import { RouteControls } from "@/features/routing/ui/route-controls";
import { RouteDatePager } from "@/features/routing/ui/route-date-pager";
import { RouteList } from "@/features/routing/ui/route-list";
import { RouteWorkspace } from "@/features/routing/ui/route-workspace";
import { StartRouteButton } from "@/features/routing/ui/start-route-button";
import { env } from "@/shared/env";
import {
  formatHHmm,
  toIstanbulDateString,
} from "@/shared/utils/date";

interface RoutesPageProps {
  searchParams: Promise<{ date?: string; optimize?: string; start?: string }>;
}

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isHHmm(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
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

/**
 * Compose a UTC ISO instant from a YYYY-MM-DD date and HH:mm wall-clock
 * time, both in Europe/Istanbul. Used to anchor route ETAs.
 *
 * Istanbul has no DST since 2016 and stays at UTC+3 year-round, so the
 * offset is fixed; this avoids a heavyweight tz library at the call site.
 */
function istanbulIsoFromDateAndTime(date: string, hhmm: string): string {
  // YYYY-MM-DDTHH:mm:00+03:00 — explicit offset = Istanbul wall clock.
  return new Date(`${date}T${hhmm}:00+03:00`).toISOString();
}

export default async function RoutesPage({ searchParams }: RoutesPageProps) {
  const params = await searchParams;
  const date =
    params.date && isYmd(params.date)
      ? params.date
      : toIstanbulDateString(new Date());
  const wantsOptimize = params.optimize === "1";

  // Default start time = "now" expressed as Istanbul HH:mm.
  const startHHmm =
    params.start && isHHmm(params.start)
      ? params.start
      : formatHHmm(new Date());

  // For "today" the start is "today HH:mm Istanbul"; for a future date the
  // user is planning ahead so we use "<date> HH:mm Istanbul".
  const startTimeIso = istanbulIsoFromDateAndTime(date, startHHmm);

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
      ? await getDayRoute(date, { startTimeIso })
      : null;
  const optimized = routeResult?.ok ? routeResult.value : null;
  const optimizeError =
    routeResult && !routeResult.ok ? routeResult.error.message : null;

  // Build the /routes/drive URL so the CTA carries the same date + start.
  const driveQuery = new URLSearchParams();
  driveQuery.set("date", date);
  driveQuery.set("start", startHHmm);

  return (
    <div className="space-y-5">
      <RouteDatePager date={date} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Rota</h2>
          <p className="text-sm text-muted-foreground">
            {dayOrders.length} sipariş
            {optimized
              ? ` · ${formatDistance(optimized.total_distance_m)} · ${formatDuration(optimized.total_duration_s)} · ≈ ${formatHHmm(optimized.finish_time_iso)} bitiş`
              : ""}
          </p>
        </div>
        {optimized ? (
          <StartRouteButton
            orderIds={optimized.stops.map((s) => s.order_id)}
            pendingCount={
              dayOrders.filter((o) => o.status === "pending").length
            }
            driveHref={`/routes/drive?${driveQuery.toString()}`}
            startHHmm={startHHmm}
          />
        ) : null}
      </div>

      <RouteControls
        date={date}
        startHHmm={startHHmm}
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
        <RouteWorkspace apiKey={mapsKey} route={optimized} />
      ) : (
        <RouteList
          rows={
            optimized
              ? { kind: "optimized", stops: optimized.stops }
              : { kind: "unoptimized", orders: dayOrders }
          }
        />
      )}
    </div>
  );
}
