"use client";

/**
 * Stop-detail panel — rendered OUTSIDE the map frame (the owner explicitly
 * doesn't want overlays cluttering the map). Appears when a stop is selected
 * via a map marker or a list row. It's an inline `<section>`, not a modal:
 * keyboard users keep their place in the list; Escape clears the selection.
 *
 * Essential data only, all already present on RouteStop — no RPC change.
 */
import { ExternalLink, Navigation, Phone, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { MarkDeliveredButton } from "@/features/routing/ui/mark-delivered-button";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatHHmm } from "@/shared/utils/date";
import { formatTRY } from "@/shared/utils/money";
import { formatTRPhone } from "@/shared/utils/phone";

import type { RouteStop } from "@/features/routing/domain/route";

function formatDistanceM(m: number | null): string {
  if (m === null) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

interface RouteStopPanelProps {
  stop: RouteStop;
  /** Show the inline "Teslim Et" action (planning view only). */
  showDeliver?: boolean;
  onClose: () => void;
  className?: string;
}

export function RouteStopPanel({
  stop,
  showDeliver = false,
  onClose,
  className,
}: RouteStopPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Escape clears the selection from anywhere inside the panel.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  // Bring the heading into view when the selection changes (helps on mobile
  // where the panel slides in below the map).
  useEffect(() => {
    headingRef.current?.scrollIntoView({ block: "nearest" });
  }, [stop.order_id]);

  const telHref = stop.customer_phone ? `tel:${stop.customer_phone}` : null;
  const navHref = `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}&travelmode=driving`;

  return (
    <section
      aria-labelledby="route-stop-heading"
      onKeyDown={onKeyDown}
      className={cn(
        "relative space-y-4 rounded-lg border bg-card p-4 shadow-sm",
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onClose}
        aria-label="Durak detayını kapat"
        className="absolute right-2 top-2"
      >
        <X className="h-4 w-4" />
      </Button>

      <header className="flex items-start gap-3 pr-8">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-white shadow">
          {stop.sequence}
        </div>
        <div className="min-w-0 flex-1">
          <h2
            ref={headingRef}
            id="route-stop-heading"
            className="truncate text-lg font-semibold leading-tight"
          >
            {stop.customer_name}
          </h2>
          <Link
            href={`/orders/${stop.order_id}`}
            className="font-mono text-xs text-muted-foreground hover:underline"
          >
            {stop.order_number}
          </Link>
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
          <dd className="font-mono">{formatDistanceM(stop.leg_distance_m)}</dd>
        </div>
        <div className="rounded-md bg-muted/40 p-2 text-center">
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Toplam yolda
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
              buttonVariants({ variant: "outline", size: "sm" }),
              "gap-1.5",
            )}
          >
            <Phone className="h-3.5 w-3.5" />
            {formatTRPhone(stop.customer_phone)}
          </a>
        ) : null}
        <a
          href={navHref}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "gap-1.5",
          )}
        >
          <Navigation className="h-3.5 w-3.5" />
          Yol Tarifi
        </a>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/customers/${stop.customer_id}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
        >
          Müşteri
          <ExternalLink className="h-3 w-3" />
        </Link>
        {showDeliver ? <MarkDeliveredButton orderId={stop.order_id} /> : null}
      </div>
    </section>
  );
}
