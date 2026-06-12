import Link from "next/link";

import { getDayOrders } from "@/features/routing/application/get-day-orders";
import { getDayRoute } from "@/features/routing/application/get-day-route";
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

  // Fetch + optimize. The route's stops include delivered ones (migration
  // 019) so re-renders mid-run still see the full sequence; the delivered
  // set below decides what's "done".
  const routeResult = await getDayRoute(date, {
    startTimeIso,
    ...(origin ? { origin } : {}),
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
  // status in {pending, confirmed, delivered} for the date.
  const ordersResult = await getDayOrders(date);
  const deliveredOrderIds = ordersResult.ok
    ? ordersResult.value
        .filter((o) => o.status === "delivered")
        .map((o) => o.order_id)
    : [];

  return (
    <DriverMode
      route={routeResult.value}
      initialDeliveredOrderIds={deliveredOrderIds}
      mapsBrowserKey={mapsKey}
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
