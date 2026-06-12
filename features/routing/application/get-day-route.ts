import "server-only";

/**
 * Optimize the day's deliveries via Google Directions.
 *
 * Pipeline:
 *   1. Resolve the warehouse origin from env. If missing → typed error.
 *   2. Fetch the day's orders via getDayOrders.
 *   3. Reject if zero orders or > Faz 1 cap (25 waypoints).
 *   4. Hand to callGoogleDirections; reorder orders by waypoint_order.
 *   5. Walk the legs in order to compute cumulative distance/duration and
 *      ETA per stop, anchored to `startTimeIso` (default = now).
 *   6. Return OptimizedRoute with step polylines for high-fidelity render.
 *
 * Faz 2 will replace step 3-4 with a proper VRP solver; spec §7.2 calls
 * the 25-cap split a stop-gap.
 */
import { getDayOrders } from "@/features/routing/application/get-day-orders";
import {
  DirectionsApiError,
  NoConfirmedOrdersError,
  TooManyWaypointsError,
  WarehouseNotConfiguredError,
} from "@/features/routing/domain/route.errors";
import { callGoogleDirections } from "@/features/routing/infrastructure/google-directions";
import { fetchDeliveryDetails } from "@/features/routing/infrastructure/order-delivery-details";
import { ExternalApiError } from "@/shared/errors/app-error";
import { env } from "@/shared/env";
import { err, isErr, ok, type Result } from "@/shared/result";

import type {
  OptimizedRoute,
  RouteStop,
} from "@/features/routing/domain/route";

const MAX_WAYPOINTS = 25; // Faz 1 — matches Google's standard plan limit.

export type GetDayRouteFailure =
  | WarehouseNotConfiguredError
  | NoConfirmedOrdersError
  | TooManyWaypointsError
  | DirectionsApiError
  | ExternalApiError;

export interface GetDayRouteOptions {
  /** ISO-8601 anchor for ETA computation. Default = now. */
  startTimeIso?: string;
}

export async function getDayRoute(
  targetDate: string,
  options: GetDayRouteOptions = {},
): Promise<Result<OptimizedRoute, GetDayRouteFailure>> {
  const warehouseLat = env.WAREHOUSE_LAT;
  const warehouseLng = env.WAREHOUSE_LNG;
  if (warehouseLat === undefined || warehouseLng === undefined) {
    return err(new WarehouseNotConfiguredError());
  }
  const origin = { lat: warehouseLat, lng: warehouseLng };

  const ordersResult = await getDayOrders(targetDate);
  if (isErr(ordersResult)) return ordersResult;
  const orders = ordersResult.value;

  if (orders.length === 0) {
    return err(new NoConfirmedOrdersError(targetDate));
  }
  if (orders.length > MAX_WAYPOINTS) {
    return err(
      new TooManyWaypointsError({ count: orders.length, cap: MAX_WAYPOINTS }),
    );
  }

  const directionsResult = await callGoogleDirections({
    origin,
    destination: origin, // round trip
    waypoints: orders.map((o) => ({ lat: o.lat, lng: o.lng })),
  });
  if (isErr(directionsResult)) return directionsResult;
  const directions = directionsResult.value;

  // Enrich with paid amount + line items (one batched lookup for the route).
  const detailById = await fetchDeliveryDetails(orders.map((o) => o.order_id));

  // Anchor for ETAs. If the supplied start is malformed, fall back to now —
  // never throw on bad UI input.
  const startMs = (() => {
    if (!options.startTimeIso) return Date.now();
    const parsed = Date.parse(options.startTimeIso);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  })();
  const startTimeIso = new Date(startMs).toISOString();

  // waypoint_order is indices into the input waypoints. Reorder orders +
  // walk legs in route sequence to derive cumulatives + ETAs. legs[i] is
  // the segment FROM stop i TO stop i+1, with leg[0] being origin → stop 1.
  let cumulativeDistanceM = 0;
  let cumulativeDurationS = 0;
  const stops: RouteStop[] = directions.waypointOrder.map((srcIdx, i) => {
    const order = orders[srcIdx];
    if (!order) {
      throw new Error(`waypoint_order[${i}]=${srcIdx} out of range`);
    }
    const leg = directions.legs[i];
    const legDistanceM = leg?.distanceM ?? null;
    const legDurationS = leg?.durationS ?? null;
    cumulativeDistanceM += legDistanceM ?? 0;
    cumulativeDurationS += legDurationS ?? 0;
    const etaIso = new Date(startMs + cumulativeDurationS * 1000).toISOString();
    const detail = detailById.get(order.order_id);
    return {
      sequence: i + 1,
      order_id: order.order_id,
      order_number: order.order_number,
      customer_id: order.customer_id,
      customer_name: `${order.customer_first_name} ${order.customer_last_name}`,
      customer_phone: order.customer_phone,
      lat: order.lat,
      lng: order.lng,
      delivery_notes: order.delivery_notes,
      total_minor: order.total_minor,
      amount_paid_minor: detail?.amount_paid_minor ?? 0,
      items: detail?.items ?? [],
      leg_distance_m: legDistanceM,
      leg_duration_s: legDurationS,
      cumulative_distance_m: cumulativeDistanceM,
      cumulative_duration_s: cumulativeDurationS,
      eta_iso: etaIso,
    };
  });

  // Final leg back to warehouse — included in totals + finish ETA but not
  // surfaced as a stop.
  const totalDistanceM = directions.legs.reduce((s, l) => s + l.distanceM, 0);
  const totalDurationS = directions.legs.reduce((s, l) => s + l.durationS, 0);
  const finishTimeIso = new Date(startMs + totalDurationS * 1000).toISOString();

  return ok({
    date: targetDate,
    origin,
    stops,
    overview_polyline: directions.overviewPolyline,
    step_polylines: directions.stepPolylines,
    start_time_iso: startTimeIso,
    finish_time_iso: finishTimeIso,
    total_distance_m: totalDistanceM,
    total_duration_s: totalDurationS,
  });
}
