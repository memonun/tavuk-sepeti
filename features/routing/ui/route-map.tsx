"use client";

/**
 * Map view for the daily route.
 *
 * Imperative marker + polyline lifecycle (same pattern as the customer-pin
 * map — React 19 ref-callback churn forced this in Sprint 3). Markers are
 * numbered HTML pills so the dispatcher reads the sequence at a glance, and
 * each is clickable: a click selects that stop, which the parent surfaces in
 * a detail panel beside the map.
 *
 * Two effects on purpose:
 *   1. BUILD — creates markers + polyline; deps are the route data only, so a
 *      mere selection change never rebuilds markers or re-decodes polylines.
 *   2. RECOLOR/PAN — keyed on selection + delivered set; only reassigns each
 *      marker element's className and pans to the selected stop.
 *
 * Polyline rendering: each leg's per-step encoded polyline is decoded and
 * concatenated into a single LatLng path — road-level fidelity (no
 * corner-cutting at street zoom) versus Google's simplified overview_polyline.
 */
import {
  APIProvider,
  Map as GoogleMap,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";

import type { RouteOrigin, RouteStop } from "@/features/routing/domain/route";

type StopMarkerState = "default" | "selected" | "delivered";

function stopMarkerClass(state: StopMarkerState): string {
  switch (state) {
    case "selected":
      return "flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-white shadow-lg ring-2 ring-amber-300 ring-offset-1 ring-offset-background";
    case "delivered":
      return "flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-medium text-white shadow ring-1 ring-background opacity-70";
    default:
      return "flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow ring-2 ring-background";
  }
}

interface RouteMapProps {
  apiKey: string;
  origin: RouteOrigin;
  stops: readonly RouteStop[];
  /** Per-step encoded polylines in route order. Empty when not optimized. */
  stepPolylines: readonly string[];
  selectedStopId: string | null;
  deliveredOrderIds?: ReadonlySet<string> | undefined;
  onSelectStop: (orderId: string) => void;
}

export function RouteMap({
  apiKey,
  origin,
  stops,
  stepPolylines,
  selectedStopId,
  deliveredOrderIds,
  onSelectStop,
}: RouteMapProps) {
  return (
    <APIProvider apiKey={apiKey}>
      <div
        className="h-full overflow-hidden rounded-lg border"
        role="application"
        aria-label="Rota haritası — duraklara aşağıdaki listeden de erişebilirsiniz"
      >
        <GoogleMap
          mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "route-overview"}
          defaultCenter={origin}
          defaultZoom={12}
          gestureHandling="greedy"
          disableDefaultUI={false}
          style={{ width: "100%", height: 540 }}
        >
          <RouteLayer
            origin={origin}
            stops={stops}
            stepPolylines={stepPolylines}
            selectedStopId={selectedStopId}
            deliveredOrderIds={deliveredOrderIds}
            onSelectStop={onSelectStop}
          />
        </GoogleMap>
      </div>
    </APIProvider>
  );
}

interface RouteLayerProps {
  origin: RouteOrigin;
  stops: readonly RouteStop[];
  stepPolylines: readonly string[];
  selectedStopId: string | null;
  deliveredOrderIds?: ReadonlySet<string> | undefined;
  onSelectStop: (orderId: string) => void;
}

function RouteLayer({
  origin,
  stops,
  stepPolylines,
  selectedStopId,
  deliveredOrderIds,
  onSelectStop,
}: RouteLayerProps) {
  const map = useMap();
  const markerLib = useMapsLibrary("marker");
  const coreLib = useMapsLibrary("core");
  const geometryLib = useMapsLibrary("geometry");
  const fitOnceRef = useRef(false);

  // Stable click callback — kept in a ref so the build effect doesn't depend
  // on it (mirrors customer-map's ref pattern; avoids marker churn).
  const onSelectRef = useRef(onSelectStop);
  useEffect(() => {
    onSelectRef.current = onSelectStop;
  }, [onSelectStop]);

  // order_id → the marker's content element, so the recolor effect can
  // restyle in place without rebuilding markers.
  const elByIdRef = useRef<Map<string, HTMLElement>>(new Map());
  const markerByIdRef = useRef<
    Map<string, google.maps.marker.AdvancedMarkerElement>
  >(new Map());

  // ---- BUILD effect: markers + polyline (route-data deps only) ----
  useEffect(() => {
    if (!map || !markerLib || !coreLib) return;

    const created: Array<google.maps.marker.AdvancedMarkerElement> = [];
    const elById = new Map<string, HTMLElement>();
    const markerById = new Map<
      string,
      google.maps.marker.AdvancedMarkerElement
    >();

    // Warehouse origin — distinct visual.
    const originEl = document.createElement("div");
    originEl.className =
      "flex items-center gap-1 rounded-full bg-foreground px-2.5 py-1 text-xs font-medium text-background shadow";
    originEl.textContent = "Depo";
    created.push(
      new markerLib.AdvancedMarkerElement({
        position: { lat: origin.lat, lng: origin.lng },
        content: originEl,
        title: "Depo",
      }),
    );

    for (const stop of stops) {
      const el = document.createElement("div");
      el.className = stopMarkerClass("default");
      el.textContent = String(stop.sequence);
      const marker = new markerLib.AdvancedMarkerElement({
        position: { lat: stop.lat, lng: stop.lng },
        content: el,
        title: `${stop.sequence}. ${stop.customer_name}`,
      });
      marker.addListener("click", () => onSelectRef.current(stop.order_id));
      created.push(marker);
      elById.set(stop.order_id, el);
      markerById.set(stop.order_id, marker);
    }
    elByIdRef.current = elById;
    markerByIdRef.current = markerById;

    let polyline: google.maps.Polyline | null = null;
    if (geometryLib && stepPolylines.length > 0) {
      const path: google.maps.LatLng[] = [];
      for (const encoded of stepPolylines) {
        path.push(...geometryLib.encoding.decodePath(encoded));
      }
      polyline = new google.maps.Polyline({
        path,
        map,
        strokeColor: "#7C3AED",
        strokeOpacity: 0.95,
        strokeWeight: 5,
        zIndex: 5,
      });
    }

    if (!fitOnceRef.current && stops.length > 0) {
      fitOnceRef.current = true;
      const bounds = new coreLib.LatLngBounds();
      bounds.extend({ lat: origin.lat, lng: origin.lng });
      for (const stop of stops) bounds.extend({ lat: stop.lat, lng: stop.lng });
      map.fitBounds(bounds, 64);
    }

    return () => {
      for (const m of created) m.map = null;
      polyline?.setMap(null);
      elByIdRef.current = new Map();
      markerByIdRef.current = new Map();
    };
  }, [map, markerLib, coreLib, geometryLib, origin, stops, stepPolylines]);

  // ---- RECOLOR + PAN effect: cheap, runs on selection/delivered change ----
  useEffect(() => {
    for (const stop of stops) {
      const el = elByIdRef.current.get(stop.order_id);
      if (!el) continue;
      const state: StopMarkerState =
        stop.order_id === selectedStopId
          ? "selected"
          : deliveredOrderIds?.has(stop.order_id)
            ? "delivered"
            : "default";
      el.className = stopMarkerClass(state);
      const marker = markerByIdRef.current.get(stop.order_id);
      if (marker) marker.zIndex = state === "selected" ? 100 : null;
    }

    if (selectedStopId && map) {
      const stop = stops.find((s) => s.order_id === selectedStopId);
      if (stop) map.panTo({ lat: stop.lat, lng: stop.lng });
    }
  }, [map, stops, selectedStopId, deliveredOrderIds]);

  return null;
}
