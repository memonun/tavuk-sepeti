"use client";

/**
 * Customer-pin map view with Google MarkerClusterer.
 *
 * Markers are created imperatively in an effect rather than via
 * <AdvancedMarker> components. The ref-callback pattern that React docs
 * suggest triggers an infinite cleanup-then-setup loop under React 19
 * with strict mode + the inline-arrow ref pattern, because each render
 * recreates the ref callback and React 19 treats that as a re-attach.
 *
 * The imperative pattern is well-trodden for Google Maps + React: the
 * component owns a single effect that creates markers, hands them to
 * the clusterer, and cleans up on unmount or when `pins` changes.
 */
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { APIProvider, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { useEffect, useRef, useState } from "react";

import { CustomerPinCard } from "@/features/map/ui/customer-pin-card";

import type { MapPin } from "@/features/map/domain/map-pin";

interface CustomerMapProps {
  apiKey: string;
  pins: MapPin[];
}

const ISTANBUL_CENTER = { lat: 41.0082, lng: 28.9784 };

export function CustomerMap({ apiKey, pins }: CustomerMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = pins.find((p) => p.customer_id === selectedId) ?? null;

  return (
    <APIProvider apiKey={apiKey}>
      <div className="relative overflow-hidden rounded-lg border">
        <Map
          mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "customer-overview"}
          defaultCenter={ISTANBUL_CENTER}
          defaultZoom={11}
          gestureHandling="greedy"
          disableDefaultUI={false}
          style={{ width: "100%", height: 600 }}
        >
          <ClusteredMarkerLayer pins={pins} onSelect={setSelectedId} />
        </Map>

        {selected ? (
          <CustomerPinCard pin={selected} onClose={() => setSelectedId(null)} />
        ) : null}
      </div>
    </APIProvider>
  );
}

interface ClusteredMarkerLayerProps {
  pins: MapPin[];
  onSelect: (id: string) => void;
}

/**
 * Owns the imperative marker lifecycle. Whenever `pins` (or the underlying
 * Map) changes, this effect:
 *   1. Tears down the previous clusterer + markers.
 *   2. Builds new AdvancedMarkerElement instances directly.
 *   3. Hands them to a fresh MarkerClusterer.
 * On unmount, the cleanup empties the cluster and detaches the markers
 * from the map (set marker.map = null).
 */
function ClusteredMarkerLayer({ pins, onSelect }: ClusteredMarkerLayerProps) {
  const map = useMap();
  // The "marker" library is lazy-loaded by @vis.gl/react-google-maps; until
  // it resolves, AdvancedMarkerElement is undefined. The "core" library
  // (LatLngBounds) is also lazy-loaded.
  const markerLibrary = useMapsLibrary("marker");
  const coreLibrary = useMapsLibrary("core");

  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Did the bounds-fit run already? Avoids re-zooming on every prop change.
  const fitOnceRef = useRef(false);

  useEffect(() => {
    if (!map || !markerLibrary || !coreLibrary) return;

    // Custom GTA-style pin: violet circle with white inner dot + tail.
    // Built with DOM elements per marker because AdvancedMarkerElement
    // wants raw HTMLElement, not React.
    const buildPinElement = (recent: boolean): HTMLElement => {
      const wrap = document.createElement("div");
      wrap.className = "relative flex flex-col items-center";
      const circle = document.createElement("div");
      circle.className = recent
        ? "flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 shadow ring-2 ring-violet-500/40"
        : "flex h-5 w-5 items-center justify-center rounded-full bg-violet-500/80 shadow ring-2 ring-violet-500/30";
      const dot = document.createElement("div");
      dot.className = recent ? "h-2 w-2 rounded-full bg-white" : "h-1.5 w-1.5 rounded-full bg-white";
      circle.appendChild(dot);
      const tail = document.createElement("div");
      tail.className = recent
        ? "-mt-0.5 h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-violet-600"
        : "-mt-0.5 h-0 w-0 border-x-[4px] border-t-[5px] border-x-transparent border-t-violet-500/80";
      wrap.appendChild(circle);
      wrap.appendChild(tail);
      return wrap;
    };

    const markers = pins.map((pin) => {
      const marker = new markerLibrary.AdvancedMarkerElement({
        position: { lat: pin.lat, lng: pin.lng },
        title: `${pin.first_name} ${pin.last_name}`,
        content: buildPinElement(pin.has_recent_order),
      });
      marker.addListener("click", () => onSelectRef.current(pin.customer_id));
      return marker;
    });

    const clusterer = new MarkerClusterer({ map, markers });

    if (!fitOnceRef.current && pins.length > 0) {
      fitOnceRef.current = true;
      const bounds = new coreLibrary.LatLngBounds();
      for (const pin of pins) bounds.extend({ lat: pin.lat, lng: pin.lng });
      map.fitBounds(bounds, 64);
    }

    return () => {
      clusterer.clearMarkers();
      for (const marker of markers) marker.map = null;
    };
  }, [map, markerLibrary, coreLibrary, pins]);

  return null;
}
