"use client";

/**
 * Customer-pin map view with Google MarkerClusterer.
 *
 * Cluster-and-marker pattern from @vis.gl/react-google-maps + the official
 * `@googlemaps/markerclusterer`:
 *   - useMap() exposes the underlying google.maps.Map.
 *   - Each AdvancedMarker registers its element via a ref callback.
 *   - A MarkerClusterer instance owns those markers and re-clusters on
 *     change. Cleared when the data changes.
 *
 * Initial bounds: fit to all pins once on first load. Default view (no pins)
 * is Istanbul.
 */
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import {
  AdvancedMarker,
  APIProvider,
  Map,
  useMap,
} from "@vis.gl/react-google-maps";
import { useCallback, useEffect, useRef, useState } from "react";

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
          mapId="customer-overview"
          defaultCenter={ISTANBUL_CENTER}
          defaultZoom={11}
          gestureHandling="greedy"
          disableDefaultUI={false}
          style={{ width: "100%", height: 600 }}
        >
          <ClusteredMarkers pins={pins} onSelect={setSelectedId} />
        </Map>

        {selected ? (
          <CustomerPinCard pin={selected} onClose={() => setSelectedId(null)} />
        ) : null}
      </div>
    </APIProvider>
  );
}

interface ClusteredMarkersProps {
  pins: MapPin[];
  onSelect: (id: string) => void;
}

function ClusteredMarkers({ pins, onSelect }: ClusteredMarkersProps) {
  const map = useMap();
  const clusterer = useRef<MarkerClusterer | null>(null);
  const markersRef = useRef<
    Map<string, google.maps.marker.AdvancedMarkerElement>
  >(new globalThis.Map());
  const [, forceUpdate] = useState(0);

  // Initialize the clusterer once the Map is available.
  useEffect(() => {
    if (!map) return;
    clusterer.current = new MarkerClusterer({ map });
    return () => {
      clusterer.current?.clearMarkers();
      clusterer.current = null;
    };
  }, [map]);

  // Fit bounds to pins on first render with data.
  const fitOnceRef = useRef(false);
  useEffect(() => {
    if (!map || pins.length === 0 || fitOnceRef.current) return;
    fitOnceRef.current = true;
    const bounds = new google.maps.LatLngBounds();
    for (const pin of pins) bounds.extend({ lat: pin.lat, lng: pin.lng });
    map.fitBounds(bounds, 64);
  }, [map, pins]);

  // Hand markers to the clusterer whenever the set changes.
  useEffect(() => {
    if (!clusterer.current) return;
    clusterer.current.clearMarkers();
    clusterer.current.addMarkers(Array.from(markersRef.current.values()));
  });

  const setMarkerRef = useCallback(
    (
      marker: google.maps.marker.AdvancedMarkerElement | null,
      id: string,
    ) => {
      if (marker && markersRef.current.get(id) === marker) return;
      if (!marker && !markersRef.current.has(id)) return;
      if (marker) markersRef.current.set(id, marker);
      else markersRef.current.delete(id);
      forceUpdate((n) => n + 1);
    },
    [],
  );

  return (
    <>
      {pins.map((pin) => (
        <AdvancedMarker
          key={pin.customer_id}
          position={{ lat: pin.lat, lng: pin.lng }}
          ref={(marker) => setMarkerRef(marker, pin.customer_id)}
          onClick={() => onSelect(pin.customer_id)}
          title={`${pin.first_name} ${pin.last_name}`}
        />
      ))}
    </>
  );
}
