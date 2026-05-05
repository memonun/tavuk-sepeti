import "server-only";

/**
 * Optimize the day's deliveries via Google Directions.
 *
 * Pipeline:
 *   1. Resolve the warehouse origin from env. If missing → typed error.
 *   2. Fetch the day's orders via getDayOrders.
 *   3. Reject if zero orders or > Faz 1 cap (25 waypoints).
 *   4. Hand to callGoogleDirections; reorder orders by waypoint_order.
 *   5. Return OptimizedRoute with legs distances/durations attached.
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

export async function getDayRoute(
  targetDate: string,
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

  // waypoint_order is indices into the input waypoints. Reorder orders.
  const stops: RouteStop[] = directions.waypointOrder.map((srcIdx, i) => {
    const order = orders[srcIdx];
    if (!order) {
      // Defensive — Google returned an index outside our input.
      throw new Error(`waypoint_order[${i}]=${srcIdx} out of range`);
    }
    const leg = directions.legs[i];
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
      leg_distance_m: leg?.distanceM ?? null,
      leg_duration_s: leg?.durationS ?? null,
    };
  });

  // legs[N] is the final return-to-warehouse leg; sum all of them.
  const totalDistanceM = directions.legs.reduce((s, l) => s + l.distanceM, 0);
  const totalDurationS = directions.legs.reduce((s, l) => s + l.durationS, 0);

  return ok({
    date: targetDate,
    origin,
    stops,
    overview_polyline: directions.overviewPolyline,
    total_distance_m: totalDistanceM,
    total_duration_s: totalDurationS,
  });
}
