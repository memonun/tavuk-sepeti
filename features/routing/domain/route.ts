/**
 * Daily delivery route domain types.
 *
 * RouteStop is the unit a driver works through: which order, where, in
 * what sequence, how far/long the leg from the previous stop took, and
 * the cumulative arrival ETA. OptimizedRoute is the full plan for a
 * calendar day.
 *
 * Polylines are Google's encoded format — the UI passes them straight to
 * google.maps.geometry.encoding.decodePath() for rendering.
 */
export interface RouteStop {
  /** 1-indexed sequence number after optimization. */
  readonly sequence: number;
  readonly order_id: string;
  readonly order_number: string;
  readonly customer_id: string;
  readonly customer_name: string;
  readonly customer_phone: string | null;
  readonly lat: number;
  readonly lng: number;
  readonly delivery_notes: string | null;
  readonly total_minor: number;
  /** Driving distance from the previous stop (or warehouse for stop #1). */
  readonly leg_distance_m: number | null;
  /** Driving duration from the previous stop (seconds). */
  readonly leg_duration_s: number | null;
  /** Total distance from the warehouse to this stop. */
  readonly cumulative_distance_m: number;
  /** Total driving duration to this stop, in seconds. */
  readonly cumulative_duration_s: number;
  /** Arrival ETA = start_time + cumulative_duration. ISO-8601 UTC. */
  readonly eta_iso: string;
}

export interface RouteOrigin {
  readonly lat: number;
  readonly lng: number;
}

export interface OptimizedRoute {
  readonly date: string; // YYYY-MM-DD (Europe/Istanbul)
  readonly origin: RouteOrigin;
  readonly stops: readonly RouteStop[];
  /** Simplified summary polyline; kept for low-zoom contexts. */
  readonly overview_polyline: string;
  /**
   * Per-step encoded polylines, in route order. Decode each, concat the
   * resulting LatLng arrays, and render as a single Polyline for road-level
   * fidelity (no corner-cutting at street zoom). This is the path consumers
   * should prefer.
   */
  readonly step_polylines: readonly string[];
  /** Anchor for ETA calculations. ISO-8601 UTC. */
  readonly start_time_iso: string;
  /** ETA of the final return-to-warehouse leg. */
  readonly finish_time_iso: string;
  readonly total_distance_m: number;
  readonly total_duration_s: number;
}
