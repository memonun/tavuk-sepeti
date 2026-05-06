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
import type { RouteOrigin, RouteStop } from "@/features/routing/domain/route";

interface RouteDriverMapProps {
  apiKey: string;
  origin: RouteOrigin;
  stops: readonly RouteStop[];
  stepPolylines: readonly string[];
  currentStopId: string | null;
  driverCoords: LatLng | null;
}

export function RouteDriverMap({
  apiKey,
  origin,
  stops,
  stepPolylines,
  currentStopId,
  driverCoords,
}: RouteDriverMapProps) {
  return (
    <APIProvider apiKey={apiKey}>
      <div className="overflow-hidden rounded-lg border">
        <Map
          mapId="route-driver"
          defaultCenter={origin}
          defaultZoom={13}
          gestureHandling="greedy"
          disableDefaultUI={false}
          style={{ width: "100%", height: 260 }}
        >
          <DriverLayer
            origin={origin}
            stops={stops}
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
  stops: readonly RouteStop[];
  stepPolylines: readonly string[];
  currentStopId: string | null;
  driverCoords: LatLng | null;
}

function DriverLayer({
  origin,
  stops,
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

    // Warehouse pin.
    const originEl = document.createElement("div");
    originEl.className =
      "flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium text-background shadow";
    originEl.textContent = "Depo";
    created.push(
      new markerLib.AdvancedMarkerElement({
        position: { lat: origin.lat, lng: origin.lng },
        content: originEl,
        title: "Depo",
      }),
    );

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
          position: { lat: stop.lat, lng: stop.lng },
          content: el,
          title: `${stop.sequence}. ${stop.customer_name}`,
        }),
      );
    }

    // Driver position pin — emerald dot when coords available.
    if (driverCoords) {
      const driverEl = document.createElement("div");
      driverEl.className =
        "h-3 w-3 rounded-full bg-emerald-500 shadow ring-4 ring-emerald-500/30";
      created.push(
        new markerLib.AdvancedMarkerElement({
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
      polyline = new google.maps.Polyline({
        path,
        map,
        strokeColor: "#3b82f6",
        strokeOpacity: 0.9,
        strokeWeight: 4,
      });
    }

    // Initial fit: if we have driver coords, frame current stop + driver.
    // Otherwise frame the whole route once.
    if (!fitOnceRef.current) {
      fitOnceRef.current = true;
      const bounds = new coreLib.LatLngBounds();
      bounds.extend({ lat: origin.lat, lng: origin.lng });
      for (const stop of stops) bounds.extend({ lat: stop.lat, lng: stop.lng });
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
    stops,
    stepPolylines,
    currentStopId,
    driverCoords,
  ]);

  return null;
}
