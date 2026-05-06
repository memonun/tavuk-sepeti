"use client";

/**
 * Address pin corrector — embeds a Google Map with a draggable AdvancedMarker.
 *
 * Lat/lng come in as props (initial value set by the geocoding pipeline);
 * dragging the pin emits onChange with the new coordinate AND the source
 * flag flipped to "admin_corrected". The form treats these as the authoritative
 * coordinate from then on.
 *
 * Accuracy badge surfaces SPEC.md §6.4 LOW_ACCURACY UX: orange warning when
 * the auto-geocode landed on `approximate` / `unknown`, prompting the admin
 * to drag the pin precisely.
 */
import { AdvancedMarker, APIProvider, Map } from "@vis.gl/react-google-maps";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { isLowAccuracy } from "@/shared/geo/accuracy";
import type { CoordinateAccuracy, CoordinateSource } from "@/shared/geo/coordinate";

interface AddressPinCorrectorProps {
  apiKey: string;
  lat: number;
  lng: number;
  accuracy: CoordinateAccuracy;
  onChange: (next: { lat: number; lng: number; source: CoordinateSource }) => void;
}

const ACCURACY_LABEL: Record<CoordinateAccuracy, string> = {
  rooftop: "Bina seviyesi — kesin",
  range_interpolated: "Sokak üzerinde — kesin",
  geometric_center: "Bölge merkezi — yaklaşık",
  approximate: "Yaklaşık — pin'i taşı ve onayla",
  unknown: "Bilinmiyor — pin'i taşı ve onayla",
};

export function AddressPinCorrector({
  apiKey,
  lat,
  lng,
  accuracy,
  onChange,
}: AddressPinCorrectorProps) {
  const low = isLowAccuracy(accuracy);

  return (
    <APIProvider apiKey={apiKey}>
      <div className="space-y-2">
        <div
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            low
              ? "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {low ? (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          <span>{ACCURACY_LABEL[accuracy]}</span>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <Map
            mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "customer-address"}
            defaultCenter={{ lat, lng }}
            center={{ lat, lng }}
            defaultZoom={low ? 14 : 17}
            gestureHandling="greedy"
            disableDefaultUI={false}
            style={{ width: "100%", height: "clamp(220px, 45vh, 320px)" }}
          >
            <AdvancedMarker
              position={{ lat, lng }}
              draggable
              onDragEnd={(event) => {
                const next = event.latLng;
                if (!next) return;
                onChange({
                  lat: next.lat(),
                  lng: next.lng(),
                  source: "admin_corrected",
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
          </Map>
        </div>
      </div>
    </APIProvider>
  );
}
