import { materializeDueRecurring } from "@/features/recurring/application/materialize-due-recurring";
import { buildDayLoadManifest } from "@/features/routing/application/get-day-load-manifest";
import { getDayOrders } from "@/features/routing/application/get-day-orders";
import { getDayRoute } from "@/features/routing/application/get-day-route";
import { listSavedLocations } from "@/features/routing/application/list-saved-locations";
import { serializeExcludeDelivered } from "@/features/routing/domain/exclude-delivered-url";
import { RouteControls } from "@/features/routing/ui/route-controls";
import { RouteDatePager } from "@/features/routing/ui/route-date-pager";
import { RouteList } from "@/features/routing/ui/route-list";
import { RouteManifestPanel } from "@/features/routing/ui/route-manifest-panel";
import { RouteWorkspace } from "@/features/routing/ui/route-workspace";
import { StartRouteButton } from "@/features/routing/ui/start-route-button";
import { env } from "@/shared/env";
import {
  formatHHmm,
  toIstanbulDateString,
} from "@/shared/utils/date";

interface RoutesPageProps {
  searchParams: Promise<{
    date?: string;
    optimize?: string;
    start?: string;
    originLat?: string;
    originLng?: string;
    originName?: string;
    destLat?: string;
    destLng?: string;
    destName?: string;
    destOrderId?: string;
  }>;
}

function parseCoord(v: string | undefined, min: number, max: number): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
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

  // Selected start location (origin) — a required pick before optimizing. Comes
  // from the saved-locations picker or "use my location", carried in the URL.
  const originLat = parseCoord(params.originLat, -90, 90);
  const originLng = parseCoord(params.originLng, -180, 180);
  const origin =
    originLat !== null && originLng !== null
      ? { lat: originLat, lng: originLng }
      : null;
  const originName = params.originName ?? null;

  // Selected final destination (end point) — optional. An order takes
  // precedence over a coordinate; absence = round trip back to the origin.
  const destLat = parseCoord(params.destLat, -90, 90);
  const destLng = parseCoord(params.destLng, -180, 180);
  const destName = params.destName ?? null;
  const destOrderId = params.destOrderId ?? null;
  const destination = destOrderId
    ? ({ kind: "order", orderId: destOrderId } as const)
    : destLat !== null && destLng !== null
      ? ({ kind: "location", lat: destLat, lng: destLng, name: destName ?? "Varış" } as const)
      : undefined;

  // Lazy materialization: generate any due recurring orders before fetching.
  // Never throws — failures are logged internally and the route page continues.
  await materializeDueRecurring(date);

  // Always fetch the day's orders + saved locations for the list/header/picker.
  // If the user has clicked Optimize AND chosen an origin, run that too —
  // separate fetches keep the UI robust when Google fails.
  const [ordersResult, savedLocationsResult] = await Promise.all([
    getDayOrders(date),
    listSavedLocations(),
  ]);
  if (!ordersResult.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Sipariş listesi yüklenemedi: {ordersResult.error.message}
      </div>
    );
  }
  const dayOrders = ordersResult.value;
  const savedLocations = savedLocationsResult.ok ? savedLocationsResult.value : [];

  // Load manifest is available straight away (no optimize needed) — it only
  // needs the day's orders + their items.
  const manifest = await buildDayLoadManifest(dayOrders);

  // Already-delivered orders, so the stop list shows their delivered state
  // (not an active "Teslim Edildi" action) — matching the manifest's counts.
  const deliveredOrderIds = new Set(
    dayOrders.filter((o) => o.status === "delivered").map((o) => o.order_id),
  );

  const routeResult =
    wantsOptimize && origin && dayOrders.length > 0
      ? await getDayRoute(date, {
          startTimeIso,
          origin,
          ...(destination ? { destination } : {}),
          // Already-delivered orders are kept out of the optimized route (they
          // show as muted "done" markers), so the path never detours through a
          // completed stop. Computed live here — the planning view re-optimizes
          // only on an explicit Optimize click, never on a passive refresh.
          excludeOrderIds: Array.from(deliveredOrderIds),
        })
      : null;
  const optimized = routeResult?.ok ? routeResult.value : null;
  const optimizeError =
    routeResult && !routeResult.ok ? routeResult.error.message : null;

  // Build the /routes/drive URL so the CTA carries the same date + start +
  // origin (so the drive view re-optimizes from the same start point).
  const driveQuery = new URLSearchParams();
  driveQuery.set("date", date);
  driveQuery.set("start", startHHmm);
  if (origin) {
    driveQuery.set("originLat", String(origin.lat));
    driveQuery.set("originLng", String(origin.lng));
  }
  if (originName) driveQuery.set("originName", originName);
  // Carry the chosen destination so the drive view ends at the same point.
  if (destOrderId) {
    driveQuery.set("destOrderId", destOrderId);
  } else if (destLat !== null && destLng !== null) {
    driveQuery.set("destLat", String(destLat));
    driveQuery.set("destLng", String(destLng));
    if (destName) driveQuery.set("destName", destName);
  }
  // Freeze the same already-delivered set into the drive URL so driver mode
  // starts with an identical waypoint set (and the drive page doesn't redirect
  // to canonicalize). Keeps the optimized order consistent planning → drive.
  driveQuery.set(
    "excludeDelivered",
    serializeExcludeDelivered(deliveredOrderIds),
  );

  // Orders shaped for the destination picker ("end at an order").
  const destinationOrders = dayOrders.map((o) => ({
    order_id: o.order_id,
    order_number: o.order_number,
    customer_name: `${o.customer_first_name} ${o.customer_last_name}`,
  }));

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
        savedLocations={savedLocations}
        originName={originName}
        hasOrigin={!!origin}
        orders={destinationOrders}
        destLat={destLat}
        destLng={destLng}
        destOrderId={destOrderId}
      />

      {savedLocations.length === 0 ? (
        <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm text-orange-700 dark:text-orange-300">
          Kayıtlı başlangıç konumu yok. &quot;Konumumu kullan&quot; ile devam
          edebilirsin.
        </div>
      ) : null}

      {optimizeError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Optimizasyon başarısız: {optimizeError}
        </div>
      ) : null}

      {dayOrders.length > 0 ? (
        <div className="w-full max-w-md">
          <RouteManifestPanel
            manifest={manifest}
            {...(optimized ? { route: optimized } : {})}
            variant="planning"
          />
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
          deliveredOrderIds={deliveredOrderIds}
        />
      )}
    </div>
  );
}
