"use client";

/**
 * Wraps the browser Geolocation API for the driver-mode page.
 *
 * Lifecycle:
 *   - "idle"     — hook just mounted; no permission requested yet.
 *   - "prompting"— calling getCurrentPosition (triggers browser prompt).
 *   - "granted"  — permission granted, watchPosition is active.
 *   - "denied"   — user refused, or browser disabled; manual mode.
 *   - "error"    — runtime failure (timeout, position unavailable).
 *
 * Permission requires HTTPS in production. localhost is exempt for dev.
 * iOS Safari requires a user gesture for the initial permission prompt —
 * the caller must invoke `request()` from a click/tap handler, not on mount.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type GeolocationStatus =
  | "idle"
  | "prompting"
  | "granted"
  | "denied"
  | "error";

export interface GeolocationCoords {
  readonly lat: number;
  readonly lng: number;
  /** Reported accuracy radius in meters (1σ). */
  readonly accuracy: number;
  /** Timestamp the device captured the fix (ms since epoch). */
  readonly timestamp: number;
}

export interface UseGeolocationResult {
  status: GeolocationStatus;
  coords: GeolocationCoords | null;
  error: string | null;
  /** Triggers the permission prompt + starts watchPosition on grant. */
  request: () => void;
  /** Whether the browser exposes the API at all. */
  supported: boolean;
}

const WATCH_OPTS: PositionOptions = {
  enableHighAccuracy: true,
  // The browser will return cached fixes up to 10s old without re-querying GPS.
  maximumAge: 10_000,
  // Give up on a single fix after 15s; downstream UI shows "konum alınamadı".
  timeout: 15_000,
};

export function useGeolocation(): UseGeolocationResult {
  const supported =
    typeof window !== "undefined" && "geolocation" in window.navigator;

  const [status, setStatus] = useState<GeolocationStatus>("idle");
  const [coords, setCoords] = useState<GeolocationCoords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const onSuccess = useCallback((pos: GeolocationPosition) => {
    setStatus("granted");
    setCoords({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      timestamp: pos.timestamp,
    });
    setError(null);
  }, []);

  const onError = useCallback((err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      setStatus("denied");
      setError("Konum izni reddedildi.");
      return;
    }
    setStatus("error");
    setError(
      err.code === err.POSITION_UNAVAILABLE
        ? "Konum alınamadı (sinyal yok?)."
        : err.code === err.TIMEOUT
          ? "Konum çok geç geldi, tekrar dene."
          : "Konum hatası.",
    );
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && supported) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [supported]);

  const request = useCallback(() => {
    if (!supported) {
      setStatus("error");
      setError("Bu tarayıcıda konum desteklenmiyor.");
      return;
    }
    if (watchIdRef.current !== null) return; // already watching

    setStatus("prompting");
    setError(null);

    // First fix triggers the permission prompt; subsequent ones come via
    // watchPosition.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onSuccess(pos);
        // Start the live watch only after we have permission confirmed.
        watchIdRef.current = navigator.geolocation.watchPosition(
          onSuccess,
          onError,
          WATCH_OPTS,
        );
      },
      onError,
      WATCH_OPTS,
    );
  }, [supported, onSuccess, onError]);

  return { status, coords, error, request, supported };
}
