"use client";

/**
 * Client island for the optimized planning view. Owns the single
 * `selectedStopId` shared by the map, the list, and the detail panel — so
 * clicking a marker, clicking a list row, and the panel all stay in sync.
 *
 * The detail panel lives OUTSIDE the map frame (per product decision): a
 * column beside the map on desktop, a slide-in region below the map on
 * mobile. A visually-hidden live region announces selection to screen
 * readers without stealing focus from the list.
 */
import { useState } from "react";

import { RouteList } from "@/features/routing/ui/route-list";
import { RouteMap } from "@/features/routing/ui/route-map";
import { RouteStopPanel } from "@/features/routing/ui/route-stop-panel";

import type { OptimizedRoute } from "@/features/routing/domain/route";

interface RouteWorkspaceProps {
  apiKey: string;
  route: OptimizedRoute;
}

export function RouteWorkspace({ apiKey, route }: RouteWorkspaceProps) {
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const selected =
    route.stops.find((s) => s.order_id === selectedStopId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="lg:flex-1">
          <RouteMap
            apiKey={apiKey}
            origin={route.origin}
            destination={route.destination}
            stops={route.stops}
            stepPolylines={route.step_polylines}
            selectedStopId={selectedStopId}
            onSelectStop={setSelectedStopId}
          />
        </div>

        {selected ? (
          <RouteStopPanel
            stop={selected}
            showDeliver
            onClose={() => setSelectedStopId(null)}
            className="lg:w-[340px] lg:shrink-0"
          />
        ) : (
          <div className="hidden min-h-[200px] items-center justify-center rounded-lg border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground lg:flex lg:w-[340px] lg:shrink-0 lg:self-stretch">
            Detayları görmek için haritadan ya da listeden bir durak seç.
          </div>
        )}
      </div>

      <RouteList
        rows={{ kind: "optimized", stops: route.stops }}
        selectedStopId={selectedStopId}
        onSelectStop={setSelectedStopId}
      />

      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {selected
          ? `Seçildi: ${selected.sequence}. durak — ${selected.customer_name}`
          : ""}
      </div>
    </div>
  );
}
