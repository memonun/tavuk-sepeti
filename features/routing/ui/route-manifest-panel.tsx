"use client";

import { useState } from "react";
import { Package, Wallet } from "lucide-react";

import type { OptimizedRoute } from "@/features/routing/domain/route";
import type { RouteManifest } from "@/features/routing/domain/route-manifest";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatHHmm } from "@/shared/utils/date";
import { formatTRY } from "@/shared/utils/money";

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

function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

interface Props {
  manifest: RouteManifest;
  /** Optimized run summary. Absent on the route page before optimization —
   *  the loads still show; only the distance/duration/finish chips are hidden. */
  route?: Pick<OptimizedRoute, "total_distance_m" | "total_duration_s" | "finish_time_iso">;
  /**
   * "planning" → static card with the full run summary footer (load before
   * leaving). "driver" → adds a Kalan/Toplam toggle and drops the footer
   * (the driver header already shows progress + finish ETA).
   */
  variant?: "planning" | "driver";
}

export function RouteManifestPanel({ manifest, route, variant = "planning" }: Props) {
  const isDriver = variant === "driver";
  // Driver mode starts on what's still in the van; planning shows the full load.
  const [showRemaining, setShowRemaining] = useState(isDriver);
  const lines = showRemaining ? manifest.remainingLoads : manifest.loads;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Package className="h-4 w-4 text-muted-foreground" />
          Yük manifestosu
          {isDriver && showRemaining ? (
            <span className="text-muted-foreground">· kalan</span>
          ) : null}
        </span>
        {isDriver ? (
          <div className="flex gap-0.5 rounded-md border p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setShowRemaining(true)}
              className={cn(
                "rounded px-2 py-0.5",
                showRemaining ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              Kalan
            </button>
            <button
              type="button"
              onClick={() => setShowRemaining(false)}
              className={cn(
                "rounded px-2 py-0.5",
                !showRemaining ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              Toplam
            </button>
          </div>
        ) : null}
      </div>

      {lines.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">Yük yok.</p>
      ) : (
        <ul className="space-y-0.5 px-3 py-2">
          {lines.map((l) => (
            <li
              key={`${l.label} ${l.unit_label}`}
              className="flex flex-wrap items-baseline gap-x-1.5 text-sm"
            >
              <span className="font-medium">{l.label}</span>
              <span className="font-mono font-semibold tabular-nums">
                ×{formatQty(l.quantity)}
              </span>
              {l.unit_label ? (
                <span className="text-muted-foreground">{l.unit_label}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!isDriver ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
          <span>{manifest.stopCount} durak</span>
          {route ? (
            <>
              <span>· {formatDistance(route.total_distance_m)}</span>
              <span>· {formatDuration(route.total_duration_s)}</span>
              <span>· ≈ {formatHHmm(route.finish_time_iso)} bitiş</span>
            </>
          ) : null}
          {manifest.toCollectMinor > 0 ? (
            <Badge variant="secondary" className="ml-auto gap-1">
              <Wallet className="h-3.5 w-3.5" />
              Tahsil: {formatTRY(manifest.toCollectMinor)}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
