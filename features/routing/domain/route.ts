/**
 * Daily delivery route domain types.
 *
 * RouteStop is the unit a driver works through: which order, where, in
 * what sequence, and how far/long the leg from the previous stop took.
 * OptimizedRoute is the full plan for a calendar day.
 *
 * Polyline is Google's encoded format — the UI passes it straight to
 * google.maps.geometry.encoding.decodePath() for rendering.
 */
export interface RouteStop {
  /** 1-indexed sequence number after optimization. */
  readonly sequence: number;
  readonly order_id: string;
  readonly order_number: string;
  readonly customer_id: string;
  readonly customer_name: string;
  readonly customer_phone: string;
  readonly lat: number;
  readonly lng: number;
  readonly delivery_notes: string | null;
  readonly total_minor: number;
  /** Driving distance from the previous stop (or warehouse for stop #1). */
  readonly leg_distance_m: number | null;
  /** Driving duration from the previous stop (seconds). */
  readonly leg_duration_s: number | null;
}

export interface RouteOrigin {
  readonly lat: number;
  readonly lng: number;
}

export interface OptimizedRoute {
  readonly date: string; // YYYY-MM-DD (Europe/Istanbul)
  readonly origin: RouteOrigin;
  readonly stops: readonly RouteStop[];
  /** Google's encoded polyline; decoded client-side for rendering. */
  readonly overview_polyline: string;
  readonly total_distance_m: number;
  readonly total_duration_s: number;
}
