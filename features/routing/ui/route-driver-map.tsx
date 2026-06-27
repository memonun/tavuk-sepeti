"use client";

/**
 * Compact driver-mode map.
 *
 * Renders the road-fidelity polyline (decoded step polylines), every stop
 * with its sequence pill (current stop in a brighter color), the warehouse
 * origin, and a live driver pin when geolocation coords are available.
 *
 * Same imperative-effect lifecycle as the planning map (Sprint 5
 * route-map.tsx) — React 19 ref-callback churn forced this pattern.
 */
import {
  APIProvider,
  Map,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";

import type { LatLng } from "@/shared/geo/distance";
import type {
  CompletedMarker,
  RouteDestination,
  RouteOrigin,
  RouteStop,
} from "@/features/routing/domain/route";

interface RouteDriverMapProps {
  apiKey: string;
  origin: RouteOrigin;
  /** Origin pin label. Defaults to "Depo"; "Konumum" after re-optimize-from-GPS. */
  originName?: string | null;
  destination?: RouteDestination | null;
  stops: readonly RouteStop[];
  /** Already-delivered stops kept off the route — drawn as muted "done" pins. */
  completedMarkers?: readonly CompletedMarker[];
  stepPolylines: readonly string[];
  currentStopId: string | null;
  driverCoords: LatLng | null;
}

export function RouteDriverMap({
  apiKey,
  origin,
  originName,
  destination,
  stops,
  completedMarkers,
  stepPolylines,
  currentStopId,
  driverCoords,
}: RouteDriverMapProps) {
  return (
    <APIProvider apiKey={apiKey}>
      <div className="overflow-hidden rounded-lg border">
        <Map
          mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "route-driver"}
          defaultCenter={origin}
          defaultZoom={13}
          gestureHandling="greedy"
          disableDefaultUI={false}
          style={{ width: "100%", height: 260 }}
        >
          <DriverLayer
            origin={origin}
            originName={originName ?? null}
            destination={destination ?? null}
            stops={stops}
            completedMarkers={completedMarkers ?? []}
            stepPolylines={stepPolylines}
            currentStopId={currentStopId}
            driverCoords={driverCoords}
          />
        </Map>
      </div>
    </APIProvider>
  );
}

interface DriverLayerProps {
  origin: RouteOrigin;
  originName?: string | null;
  destination?: RouteDestination | null;
  stops: readonly RouteStop[];
  completedMarkers: readonly CompletedMarker[];
  stepPolylines: readonly string[];
  currentStopId: string | null;
  driverCoords: LatLng | null;
}

function DriverLayer({
  origin,
  originName,
  destination,
  stops,
  completedMarkers,
  stepPolylines,
  currentStopId,
  driverCoords,
}: DriverLayerProps) {
  const map = useMap();
  const markerLib = useMapsLibrary("marker");
  const coreLib = useMapsLibrary("core");
  const geometryLib = useMapsLibrary("geometry");
  const fitOnceRef = useRef(false);

  useEffect(() => {
    if (!map || !markerLib || !coreLib) return;

    const created: google.maps.marker.AdvancedMarkerElement[] = [];

    // Origin pin — the warehouse, or the driver's live position after a
    // re-optimize-from-here (label carried in `originName`).
    const originLabel = originName ?? "Depo";
    const originEl = document.createElement("div");
    originEl.className =
      "flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium text-background shadow";
    originEl.textContent = originLabel;
    created.push(
      new markerLib.AdvancedMarkerElement({
        map,
        position: { lat: origin.lat, lng: origin.lng },
        content: originEl,
        title: originLabel,
      }),
    );

    // Non-delivery end point (saved location). Order destinations already show
    // as the final numbered stop.
    if (destination && destination.kind === "location") {
      const destEl = document.createElement("div");
      destEl.className =
        "flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-medium text-white shadow";
      destEl.textContent = `🏁 ${destination.name}`;
      created.push(
        new markerLib.AdvancedMarkerElement({
          map,
          position: { lat: destination.lat, lng: destination.lng },
          content: destEl,
          title: `Varış: ${destination.name}`,
        }),
      );
    }

    // Already-delivered stops kept off the route — muted grey "done" pins so
    // the driver still sees them for context without them being part of the
    // sequence. Drawn first so active stops/polyline sit on top.
    for (const marker of completedMarkers) {
      const doneEl = document.createElement("div");
      doneEl.className =
        "flex h-5 w-5 items-center justify-center rounded-full bg-slate-400 text-[10px] font-bold text-white shadow ring-1 ring-background opacity-60";
      doneEl.textContent = "✓";
      created.push(
        new markerLib.AdvancedMarkerElement({
          map,
          position: { lat: marker.lat, lng: marker.lng },
          content: doneEl,
          title: `Teslim edildi · ${marker.customer_name}`,
        }),
      );
    }

    // Stop pins; current stop is amber, others are primary blue.
    for (const stop of stops) {
      const isCurrent = stop.order_id === currentStopId;
      const el = document.createElement("div");
      el.className = isCurrent
        ? "flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white shadow ring-2 ring-background"
        : "flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow ring-2 ring-background opacity-60";
      el.textContent = String(stop.sequence);
      created.push(
        new markerLib.AdvancedMarkerElement({
          map,
          position: { lat: stop.lat, lng: stop.lng },
          content: el,
          title: `${stop.sequence}. ${stop.customer_name}`,
        }),
      );
    }

    // Driver position pin — GTA-style bright cyan-blue dot with a
    // pulsing violet halo. zIndex up so it sits over polyline + stops.
    if (driverCoords) {
      const driverEl = document.createElement("div");
      driverEl.className =
        "h-3.5 w-3.5 rounded-full bg-blue-500 shadow ring-4 ring-violet-500/40";
      created.push(
        new markerLib.AdvancedMarkerElement({
          map,
          position: { lat: driverCoords.lat, lng: driverCoords.lng },
          content: driverEl,
          title: "Senin konumun",
          zIndex: 9999,
        }),
      );
    }

    // High-fidelity stitched polyline.
    let polyline: google.maps.Polyline | null = null;
    if (geometryLib && stepPolylines.length > 0) {
      const path: google.maps.LatLng[] = [];
      for (const encoded of stepPolylines) {
        path.push(...geometryLib.encoding.decodePath(encoded));
      }
      // GTA-style GPS waypoint route — vivid violet, slightly thicker
      // for driver-mode legibility on small screens.
      polyline = new google.maps.Polyline({
        path,
        map,
        strokeColor: "#7C3AED",
        strokeOpacity: 0.95,
        strokeWeight: 5,
        zIndex: 5,
      });
    }

    // Initial fit: if we have driver coords, frame current stop + driver.
    // Otherwise frame the whole route once.
    if (!fitOnceRef.current) {
      fitOnceRef.current = true;
      const bounds = new coreLib.LatLngBounds();
      bounds.extend({ lat: origin.lat, lng: origin.lng });
      for (const stop of stops) bounds.extend({ lat: stop.lat, lng: stop.lng });
      for (const marker of completedMarkers) {
        bounds.extend({ lat: marker.lat, lng: marker.lng });
      }
      if (destination && destination.kind === "location") {
        bounds.extend({ lat: destination.lat, lng: destination.lng });
      }
      if (driverCoords) bounds.extend(driverCoords);
      map.fitBounds(bounds, 48);
    }

    return () => {
      for (const m of created) m.map = null;
      polyline?.setMap(null);
    };
  }, [
    map,
    markerLib,
    coreLib,
    geometryLib,
    origin,
    originName,
    destination,
    stops,
    completedMarkers,
    stepPolylines,
    currentStopId,
    driverCoords,
  ]);

  return null;
}
