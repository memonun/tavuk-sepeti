import Link from "next/link";

import { getDayOrders } from "@/features/routing/application/get-day-orders";
import { getDayRoute } from "@/features/routing/application/get-day-route";
import { listSavedLocations } from "@/features/routing/application/list-saved-locations";
import { DriverMode } from "@/features/routing/ui/driver-mode";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { env } from "@/shared/env";
import { formatHHmm, toIstanbulDateString } from "@/shared/utils/date";

interface DrivePageProps {
  searchParams: Promise<{
    date?: string;
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

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseCoord(v: string | undefined, min: number, max: number): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function isHHmm(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function istanbulIsoFromDateAndTime(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm}:00+03:00`).toISOString();
}

export default async function DrivePage({ searchParams }: DrivePageProps) {
  const params = await searchParams;
  const date =
    params.date && isYmd(params.date)
      ? params.date
      : toIstanbulDateString(new Date());
  const startHHmm =
    params.start && isHHmm(params.start)
      ? params.start
      : formatHHmm(new Date());
  const startTimeIso = istanbulIsoFromDateAndTime(date, startHHmm);

  const mapsKey = env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  if (!mapsKey) {
    return (
      <DriveError title="Harita anahtarı eksik">
        {`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY .env'de tanımlı değil.`}
      </DriveError>
    );
  }

  // Start location chosen on the planning page (carried in the URL). When
  // absent, getDayRoute falls back to the default saved location.
  const originLat = parseCoord(params.originLat, -90, 90);
  const originLng = parseCoord(params.originLng, -180, 180);
  const origin =
    originLat !== null && originLng !== null
      ? { lat: originLat, lng: originLng }
      : undefined;

  // Chosen final destination (carried from the planning page or a mid-route
  // change). An order takes precedence over a coordinate; absence = round trip.
  const destLat = parseCoord(params.destLat, -90, 90);
  const destLng = parseCoord(params.destLng, -180, 180);
  const destName = params.destName ?? null;
  const destOrderId = params.destOrderId ?? null;
  const destination = destOrderId
    ? ({ kind: "order", orderId: destOrderId } as const)
    : destLat !== null && destLng !== null
      ? ({ kind: "location", lat: destLat, lng: destLng, name: destName ?? "Varış" } as const)
      : undefined;

  // Fetch + optimize. The route's stops include delivered ones (migration
  // 019) so re-renders mid-run still see the full sequence; the delivered
  // set below decides what's "done".
  const routeResult = await getDayRoute(date, {
    startTimeIso,
    ...(origin ? { origin } : {}),
    ...(destination ? { destination } : {}),
  });
  if (!routeResult.ok) {
    return (
      <DriveError title="Rota başlatılamadı">
        {routeResult.error.message}
      </DriveError>
    );
  }

  // Independent fetch of all orders for the day so we know which are
  // already delivered. getDayOrders uses the same RPC and returns every
  // status in {pending, confirmed, delivered} for the date. Saved locations
  // feed the mid-route "change destination" picker.
  const [ordersResult, savedLocationsResult] = await Promise.all([
    getDayOrders(date),
    listSavedLocations(),
  ]);
  const deliveredOrderIds = ordersResult.ok
    ? ordersResult.value
        .filter((o) => o.status === "delivered")
        .map((o) => o.order_id)
    : [];
  const savedLocations = savedLocationsResult.ok ? savedLocationsResult.value : [];

  // Current drive params, so a mid-route destination change can re-navigate
  // with everything else (date/start/origin) preserved.
  const driveQuery = new URLSearchParams();
  driveQuery.set("date", date);
  driveQuery.set("start", startHHmm);
  if (origin) {
    driveQuery.set("originLat", String(origin.lat));
    driveQuery.set("originLng", String(origin.lng));
  }
  if (params.originName) driveQuery.set("originName", params.originName);
  if (destOrderId) {
    driveQuery.set("destOrderId", destOrderId);
  } else if (destLat !== null && destLng !== null) {
    driveQuery.set("destLat", String(destLat));
    driveQuery.set("destLng", String(destLng));
    if (destName) driveQuery.set("destName", destName);
  }

  return (
    <DriverMode
      route={routeResult.value}
      initialDeliveredOrderIds={deliveredOrderIds}
      mapsBrowserKey={mapsKey}
      savedLocations={savedLocations}
      driveQuery={driveQuery.toString()}
    />
  );
}

interface DriveErrorProps {
  title: string;
  children: React.ReactNode;
}

function DriveError({ title, children }: DriveErrorProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
      <Link href="/routes" className={cn(buttonVariants({ size: "default" }))}>
        Rotaya dön
      </Link>
    </div>
  );
}
