"use client";

/**
 * Address pin corrector — embeds a Google Map with a draggable AdvancedMarker.
 *
 * Lat/lng come in as props (initial value set by the geocoding pipeline);
 * dragging the pin emits onChange with the new coordinate AND `pinSource` as
 * the coordinate's provenance. The caller treats that as the authoritative
 * coordinate from then on.
 *
 * `pinSource` is a required prop rather than a hard-coded "admin_corrected"
 * because this component is now shared: the admin form passes
 * "admin_corrected", the storefront passes "user_pin" (the customer placed it
 * on their own door). That distinction is what lets the web-order schema honour
 * CLAUDE.md §8 — an `approximate` coordinate is only acceptable when the person
 * standing at the address dragged the pin themselves.
 *
 * Accuracy badge surfaces SPEC.md §6.4 LOW_ACCURACY UX: orange warning when the
 * auto-geocode landed on `approximate` / `unknown`, prompting a precise drag.
 *
 * Note: this component assumes an `<APIProvider>` ancestor — use
 * `<AddressMapsProvider>` so this map and the autocomplete share one script load.
 */
import { AdvancedMarker, Map } from "@vis.gl/react-google-maps";
import { AlertTriangle, CheckCircle2, MapPin } from "lucide-react";
import { useMemo } from "react";

import { isLowAccuracy } from "@/shared/geo/accuracy";
import type { CoordinateAccuracy, CoordinateSource } from "@/shared/geo/coordinate";

interface AddressPinCorrectorProps {
  lat: number;
  lng: number;
  accuracy: CoordinateAccuracy;
  /** Provenance stamped on the coordinate when the user drags the pin. */
  pinSource: CoordinateSource;
  onChange: (next: { lat: number; lng: number; source: CoordinateSource }) => void;
  /** Overrides the accuracy-derived caption (the storefront asks for a
   *  confirmation rather than describing geocoder precision). */
  hint?: string;
  /**
   * False while the customer has not chosen a point yet. The map still renders
   * — centred on `lat`/`lng` as a neutral starting view — but shows no marker,
   * so an empty map reads as "pick a spot" rather than as a pin already on the
   * wrong door. Defaults to true for the admin form, which always opens with a
   * geocoded pin.
   */
  hasPin?: boolean;
}

const ACCURACY_LABEL: Record<CoordinateAccuracy, string> = {
  rooftop: "Bina seviyesi — kesin",
  range_interpolated: "Sokak üzerinde — kesin",
  geometric_center: "Bölge merkezi — yaklaşık",
  approximate: "Yaklaşık — pin'i taşı ve onayla",
  unknown: "Bilinmiyor — pin'i taşı ve onayla",
};

export function AddressPinCorrector({
  lat,
  lng,
  accuracy,
  pinSource,
  onChange,
  hint,
  hasPin = true,
}: AddressPinCorrectorProps) {
  const low = isLowAccuracy(accuracy);

  // Recentre only when the coordinate itself moves. A fresh object literal on
  // every render would re-apply `center` continuously and fight the user's own
  // panning — which is fatal here, since panning is how you find your door
  // before there is a pin to drag.
  const center = useMemo(() => ({ lat, lng }), [lat, lng]);

  return (
    <div className="space-y-2">
        <div
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            !hasPin || low
              ? "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {!hasPin ? (
            <MapPin className="h-4 w-4 shrink-0" />
          ) : low ? (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          <span>{hint ?? ACCURACY_LABEL[accuracy]}</span>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <Map
            mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "customer-address"}
            defaultCenter={center}
            center={center}
            defaultZoom={hasPin && !low ? 17 : 14}
            gestureHandling="greedy"
            disableDefaultUI={false}
            style={{ width: "100%", height: "clamp(220px, 45vh, 320px)" }}
            // Tapping the map is the primary way to place the first pin —
            // dragging only works once a marker already exists.
            onClick={(event) => {
              const next = event.detail.latLng;
              if (!next) return;
              onChange({ lat: next.lat, lng: next.lng, source: pinSource });
            }}
          >
            {hasPin ? (
            <AdvancedMarker
              position={center}
              draggable
              onDragEnd={(event) => {
                const next = event.latLng;
                if (!next) return;
                onChange({
                  lat: next.lat(),
                  lng: next.lng(),
                  source: pinSource,
                });
              }}
            >
              {/* GTA-style waypoint marker — vivid violet circle with
                  inner white dot + glow ring. Pin shape under it via
                  thin tail using a CSS triangle. */}
              <div className="relative flex flex-col items-center">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 shadow-lg ring-4 ring-violet-500/40">
                  <div className="h-2.5 w-2.5 rounded-full bg-white" />
                </div>
                <div className="-mt-1 h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-violet-600" />
              </div>
            </AdvancedMarker>
            ) : null}
          </Map>
        </div>
    </div>
  );
}
