"use client";

/**
 * Current-stop card for driver mode. Big tap targets, deep-link CTAs to
 * the OS dialer + the OS native maps app.
 *
 * Live distance: when `driverCoords` is provided we render the Haversine
 * meters to the stop. The Haversine helper is pure math (no Maps script
 * dependency), so updates land instantly on every geolocation tick.
 */
import { Check, Navigation, Phone, SkipForward } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { haversineMeters, type LatLng } from "@/shared/geo/distance";
import { formatHHmm } from "@/shared/utils/date";
import { formatTRY } from "@/shared/utils/money";
import { formatTRPhone } from "@/shared/utils/phone";

import type { RouteStop } from "@/features/routing/domain/route";

export type StopViewState = "delivered" | "skipped" | "current" | "upcoming";

interface StopCardProps {
  stop: RouteStop;
  totalStops: number;
  driverCoords: LatLng | null;
  /** How this stop relates to the run — drives the status banner. */
  viewState?: StopViewState;
}

function formatDistanceM(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(1).replace(".", ",");
}

export function StopCard({
  stop,
  totalStops,
  driverCoords,
  viewState = "current",
}: StopCardProps) {
  const liveDistanceM = driverCoords
    ? haversineMeters(driverCoords, { lat: stop.lat, lng: stop.lng })
    : null;

  // Payment status, derived locally (no cross-feature import).
  const paid = stop.amount_paid_minor;
  const balance = stop.total_minor - paid;
  const payStatus = paid <= 0 ? "unpaid" : balance > 0 ? "partial" : "paid";
  const payLabel =
    payStatus === "paid" ? "Ödendi" : payStatus === "partial" ? "Kısmi" : "Ödenmedi";

  // OS-native deep links — work on iOS Safari, Android Chrome, and fall
  // back to web maps on desktop. Phone may be null for CSV-imported
  // customers; the "Ara" button is then hidden.
  const telHref = stop.customer_phone ? `tel:${stop.customer_phone}` : null;
  const navHref = `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}&travelmode=driving`;

  return (
    <article
      className={cn(
        "space-y-4 rounded-xl border bg-card p-5 shadow-sm",
        viewState === "delivered" && "border-emerald-500/40",
        viewState === "skipped" && "border-amber-500/40",
      )}
    >
      {viewState === "delivered" ? (
        <p className="-m-1 flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          <Check className="h-4 w-4" /> Teslim edildi
        </p>
      ) : viewState === "skipped" ? (
        <p className="-m-1 flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-700 dark:text-amber-300">
          <SkipForward className="h-4 w-4" /> Atlandı
        </p>
      ) : null}

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

      <dl className="grid grid-cols-2 gap-2 text-sm">
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
            Toplam mesafe
          </dt>
          <dd className="font-mono">
            {formatDistanceM(stop.cumulative_distance_m)}
          </dd>
        </div>
      </dl>

      {/* Payment summary */}
      <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Tahsilat
          </span>
          <Badge
            variant={payStatus === "paid" ? "default" : "outline"}
            className={cn(
              "text-xs",
              payStatus === "partial" &&
                "border-amber-500/40 text-amber-700 dark:text-amber-300",
              payStatus === "unpaid" &&
                "border-rose-500/40 text-rose-700 dark:text-rose-300",
            )}
          >
            {payLabel}
          </Badge>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div className="text-center">
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Tutar
            </dt>
            <dd className="font-mono">{formatTRY(stop.total_minor)}</dd>
          </div>
          <div className="text-center">
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Ödenen
            </dt>
            <dd className="font-mono">{formatTRY(paid)}</dd>
          </div>
          <div
            className={cn(
              "rounded-md text-center",
              balance > 0 ? "bg-amber-500/10" : "bg-emerald-500/10",
            )}
          >
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Kalan
            </dt>
            <dd className="font-mono font-semibold">{formatTRY(balance)}</dd>
          </div>
        </dl>
      </div>

      {/* Order items */}
      {stop.items.length > 0 ? (
        <ul className="divide-y rounded-lg border text-sm">
          {stop.items.map((item, i) => (
            <li
              key={`${item.label}-${i}`}
              className="flex items-center justify-between gap-2 px-3 py-2"
            >
              <span className="min-w-0 truncate">
                <span className="font-mono text-muted-foreground">
                  {formatQty(item.quantity)}×
                </span>{" "}
                {item.label}
              </span>
              <span className="shrink-0 font-mono">
                {formatTRY(item.line_total_minor)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

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
