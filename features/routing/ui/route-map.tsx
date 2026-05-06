"use client";

/**
 * Map view for the daily route.
 *
 * Imperative marker + polyline lifecycle in a single effect (same pattern
 * as the customer-pin map — React 19 ref-callback churn forced this in
 * Sprint 3). Markers are numbered HTML pills so the driver can read the
 * sequence at a glance.
 *
 * Polyline rendering: each leg's per-step encoded polyline is decoded and
 * concatenated into a single LatLng path — gives road-level fidelity
 * (no corner-cutting at street zoom) versus Google's simplified
 * overview_polyline.
 */
import {
  APIProvider,
  Map,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";

import type { RouteOrigin, RouteStop } from "@/features/routing/domain/route";

interface RouteMapProps {
  apiKey: string;
  origin: RouteOrigin;
  stops: readonly RouteStop[];
  /** Per-step encoded polylines in route order. Empty when not optimized. */
  stepPolylines: readonly string[];
}

export function RouteMap({
  apiKey,
  origin,
  stops,
  stepPolylines,
}: RouteMapProps) {
  return (
    <APIProvider apiKey={apiKey}>
      <div className="overflow-hidden rounded-lg border">
        <Map
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
          />
        </Map>
      </div>
    </APIProvider>
  );
}

interface RouteLayerProps {
  origin: RouteOrigin;
  stops: readonly RouteStop[];
  stepPolylines: readonly string[];
}

function RouteLayer({ origin, stops, stepPolylines }: RouteLayerProps) {
  const map = useMap();
  const markerLib = useMapsLibrary("marker");
  const coreLib = useMapsLibrary("core");
  const geometryLib = useMapsLibrary("geometry");
  const fitOnceRef = useRef(false);

  useEffect(() => {
    if (!map || !markerLib || !coreLib) return;

    const created: Array<google.maps.marker.AdvancedMarkerElement> = [];

    // Warehouse origin — distinct visual.
    const originEl = document.createElement("div");
    originEl.className =
      "flex items-center gap-1 rounded-full bg-foreground px-2.5 py-1 text-xs font-medium text-background shadow";
    originEl.textContent = "Depo";
    const originMarker = new markerLib.AdvancedMarkerElement({
      position: { lat: origin.lat, lng: origin.lng },
      content: originEl,
      title: "Depo",
    });
    created.push(originMarker);

    for (const stop of stops) {
      const el = document.createElement("div");
      el.className =
        "flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow ring-2 ring-background";
      el.textContent = String(stop.sequence);
      const marker = new markerLib.AdvancedMarkerElement({
        position: { lat: stop.lat, lng: stop.lng },
        content: el,
        title: `${stop.sequence}. ${stop.customer_name}`,
      });
      created.push(marker);
    }

    // Stitch step polylines into one road-fidelity path. Decode each step's
    // encoded points; concat the LatLngs end-to-end (no de-duplication
    // needed because consecutive steps share an endpoint that just looks
    // like a single waypoint — visually fine).
    let polyline: google.maps.Polyline | null = null;
    if (geometryLib && stepPolylines.length > 0) {
      const path: google.maps.LatLng[] = [];
      for (const encoded of stepPolylines) {
        const segment = geometryLib.encoding.decodePath(encoded);
        path.push(...segment);
      }
      // GTA-style GPS waypoint route: vivid blue-purple. The slight
      // glow comes from a wider, more transparent under-stroke.
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
    };
  }, [map, markerLib, coreLib, geometryLib, origin, stops, stepPolylines]);

  return null;
}
