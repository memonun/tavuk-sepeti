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
/** One line item on a stop's order — enough to render without rejoining. */
export interface RouteStopItem {
  /** Frozen product display name at order time. */
  readonly label: string;
  /** Frozen unit label at order time (e.g. "paket (15 adet)", "kg"). */
  readonly unit_label: string;
  readonly quantity: number;
  /** Frozen per-unit price at order time (kuruş). */
  readonly unit_price_minor: number;
  readonly line_total_minor: number;
}

export interface RouteStop {
  /** 1-indexed sequence number after optimization. */
  readonly sequence: number;
  readonly order_id: string;
  readonly order_number: string;
  readonly customer_id: string;
  readonly customer_name: string;
  readonly customer_phone: string | null;
  /** Customer-level note (allergies, "call before delivery"). Live. */
  readonly customer_notes: string | null;
  readonly lat: number;
  readonly lng: number;
  /** Written delivery address, from the address row THIS ORDER points at
   *  (orders.address_id) — the same row the pin/legs use, so the text always
   *  matches the route. */
  readonly delivery_address: string | null;
  /** Açık adres street line ("Adres" field) from the order's address.
   *  Kept alongside the composed `delivery_address` so the delivery-readiness
   *  check can tell "no street" from "city/district only". */
  readonly delivery_street: string | null;
  /** Bina no from the order's address. */
  readonly building_no: string | null;
  /** Daire / apartment no from the order's address. */
  readonly apartment_no: string | null;
  /** Pin inside a configured delivery service area? `null` = none configured. */
  readonly in_service_area: boolean | null;
  readonly delivery_notes: string | null;
  readonly total_minor: number;
  /** Amount collected so far (kuruş). Drives the paid/partial/unpaid badge. */
  readonly amount_paid_minor: number;
  /** Order line items, in insertion order. */
  readonly items: readonly RouteStopItem[];
  /** Driving distance from the previous stop (or warehouse for stop #1). */
  readonly leg_distance_m: number | null;
  /** Driving duration from the previous stop (seconds). */
  readonly leg_duration_s: number | null;
  /** Total distance from the warehouse to this stop. */
  readonly cumulative_distance_m: number;
  /** Total driving duration to this stop, in seconds. */
  readonly cumulative_duration_s: number;
  /** Arrival ETA = start_time + cumulative_duration + dwell time at every
   *  PRIOR stop (route-schedule.ts's STOP_DWELL_SECONDS — a flat estimate,
   *  not live tracking). ISO-8601 UTC. */
  readonly eta_iso: string;
}

export interface RouteOrigin {
  readonly lat: number;
  readonly lng: number;
}

/**
 * A stop that was already delivered when the route was optimized, so it was
 * deliberately kept OUT of the Google waypoint set — including it would distort
 * the optimized driving path through a place the driver has already been.
 * Rendered as a muted "done" pin for context; never part of the sequence, the
 * legs, or the ETAs.
 */
export interface CompletedMarker {
  readonly order_id: string;
  readonly order_number: string;
  readonly customer_name: string;
  readonly lat: number;
  readonly lng: number;
}

/**
 * Where the route ends, when it's NOT a round trip back to the origin.
 * `null` on OptimizedRoute means the legacy round-trip (end = origin).
 * For `kind: "order"`, the order also appears as the final RouteStop, so
 * `order_id` matches that stop; for `kind: "location"` the endpoint is a
 * non-delivery point drawn as its own marker.
 */
export interface RouteDestination {
  readonly kind: "location" | "order";
  readonly lat: number;
  readonly lng: number;
  /** Label for the map marker / route summary. */
  readonly name: string;
  /** Present only when kind === "order" — the pinned final stop's order. */
  readonly order_id?: string;
}

export interface OptimizedRoute {
  readonly date: string; // YYYY-MM-DD (Europe/Istanbul)
  readonly origin: RouteOrigin;
  /** Chosen end point. `null` = round trip back to the origin (default). */
  readonly destination: RouteDestination | null;
  readonly stops: readonly RouteStop[];
  /**
   * Orders already delivered at optimize time, pulled out of the waypoints so
   * the optimizer doesn't route through completed stops. Shown as muted pins
   * for context only — empty when nothing was delivered yet.
   */
  readonly completed_markers: readonly CompletedMarker[];
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
  /** ETA at the final leg's end — the chosen destination, or the origin on a
   *  round trip. Includes dwell time at every stop (route-schedule.ts), so
   *  it's later than start_time_iso + total_duration_s on purpose. */
  readonly finish_time_iso: string;
  readonly total_distance_m: number;
  /** Pure driving time — does NOT include stop dwell. See finish_time_iso
   *  for the dwell-aware "when is the driver actually done" estimate. */
  readonly total_duration_s: number;
}
