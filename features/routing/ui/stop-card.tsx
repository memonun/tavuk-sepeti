"use client";

/**
 * Current-stop card for driver mode. Big tap targets, deep-link CTAs to
 * the OS dialer + the OS native maps app.
 *
 * Live distance: when `driverCoords` is provided we render the Haversine
 * meters to the stop. The Haversine helper is pure math (no Maps script
 * dependency), so updates land instantly on every geolocation tick.
 */
import { Navigation, Phone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { haversineMeters, type LatLng } from "@/shared/geo/distance";
import { formatHHmm } from "@/shared/utils/date";
import { formatTRY } from "@/shared/utils/money";
import { formatTRPhone } from "@/shared/utils/phone";

import type { RouteStop } from "@/features/routing/domain/route";

interface StopCardProps {
  stop: RouteStop;
  totalStops: number;
  driverCoords: LatLng | null;
}

function formatDistanceM(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function StopCard({ stop, totalStops, driverCoords }: StopCardProps) {
  const liveDistanceM = driverCoords
    ? haversineMeters(driverCoords, { lat: stop.lat, lng: stop.lng })
    : null;

  // OS-native deep links — work on iOS Safari, Android Chrome, and fall
  // back to web maps on desktop. Phone may be null for CSV-imported
  // customers; the "Ara" button is then hidden.
  const telHref = stop.customer_phone ? `tel:${stop.customer_phone}` : null;
  const navHref = `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}&travelmode=driving`;

  return (
    <article className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
      <header className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">
          {stop.sequence}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            Durak {stop.sequence} / {totalStops}
          </p>
          <h3 className="truncate text-2xl font-semibold leading-tight">
            {stop.customer_name}
          </h3>
        </div>
        <Badge variant="secondary" className="font-mono text-xs">
          ≈ {formatHHmm(stop.eta_iso)}
        </Badge>
      </header>

      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-md bg-muted/40 p-2 text-center">
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Bu durağa
          </dt>
          <dd className="font-mono">
            {stop.leg_distance_m !== null
              ? formatDistanceM(stop.leg_distance_m)
              : "—"}
          </dd>
        </div>
        <div className="rounded-md bg-muted/40 p-2 text-center">
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Toplam
          </dt>
          <dd className="font-mono">
            {formatDistanceM(stop.cumulative_distance_m)}
          </dd>
        </div>
        <div className="rounded-md bg-muted/40 p-2 text-center">
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Tutar
          </dt>
          <dd className="font-mono">{formatTRY(stop.total_minor)}</dd>
        </div>
      </dl>

      {liveDistanceM !== null ? (
        <p className="rounded-md border bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Şu an{" "}
          <span className="font-mono font-semibold">
            {formatDistanceM(liveDistanceM)}
          </span>{" "}
          uzakta
          {liveDistanceM < 100 ? " — yaklaştın!" : null}
        </p>
      ) : null}

      {stop.delivery_notes ? (
        <p className="rounded-md border bg-muted/30 p-3 text-sm">
          <span className="font-medium">Not: </span>
          {stop.delivery_notes}
        </p>
      ) : null}

      <div className={cn("grid gap-2", telHref ? "grid-cols-2" : "grid-cols-1")}>
        {telHref ? (
          <a
            href={telHref}
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "h-12 gap-2",
            )}
          >
            <Phone className="h-4 w-4" />
            {formatTRPhone(stop.customer_phone)}
          </a>
        ) : null}
        <a
          href={navHref}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "h-12 gap-2",
          )}
        >
          <Navigation className="h-4 w-4" />
          Yol Tarifi
        </a>
      </div>
    </article>
  );
}
