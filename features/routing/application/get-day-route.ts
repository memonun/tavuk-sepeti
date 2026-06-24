import "server-only";

/**
 * Optimize the day's deliveries via the Google Routes API (computeRoutes).
 *
 * Pipeline:
 *   1. Resolve the warehouse origin from env. If missing → typed error.
 *   2. Fetch the day's orders via getDayOrders.
 *   3. Reject if zero orders or > the optimization cap (98 waypoints).
 *   4. Hand to callGoogleDirections; reorder orders by the optimized order.
 *   5. Walk the legs in order to compute cumulative distance/duration and
 *      ETA per stop, anchored to `startTimeIso` (default = now).
 *   6. Return OptimizedRoute with step polylines for high-fidelity render.
 *
 * Faz 2 will replace step 3-4 with a proper VRP solver (multiple vehicles /
 * time windows); spec §7.2 calls the single-request cap a stop-gap.
 */
import { getDayOrders } from "@/features/routing/application/get-day-orders";
import {
  DirectionsApiError,
  NoConfirmedOrdersError,
  TooManyWaypointsError,
  WarehouseNotConfiguredError,
} from "@/features/routing/domain/route.errors";
import { resolveRouteDestination } from "@/features/routing/domain/route-destination";
import { callGoogleDirections } from "@/features/routing/infrastructure/google-directions";
import { fetchDeliveryDetails } from "@/features/routing/infrastructure/order-delivery-details";
import { getDefaultSavedLocation } from "@/features/routing/infrastructure/saved-location.repository";
import { ExternalApiError } from "@/shared/errors/app-error";
import { env } from "@/shared/env";
import { logger } from "@/shared/logger";
import { err, isErr, ok, type Result } from "@/shared/result";

import type { RouteDestinationOption } from "@/features/routing/domain/route-destination";
import type {
  OptimizedRoute,
  RouteStop,
} from "@/features/routing/domain/route";

// Routes API `optimizeWaypointOrder` supports up to 98 intermediate stops when
// every point is a lat/lng coordinate (we always send coordinates, never place
// IDs). The destination is a separate point, not a waypoint.
const MAX_WAYPOINTS = 98;

export type GetDayRouteFailure =
  | WarehouseNotConfiguredError
  | NoConfirmedOrdersError
  | TooManyWaypointsError
  | DirectionsApiError
  | ExternalApiError;

export interface GetDayRouteOptions {
  /** ISO-8601 anchor for ETA computation. Default = now. */
  startTimeIso?: string;
  /** Route start point. When omitted, falls back to the default saved
   *  location, then the legacy env warehouse. */
  origin?: { lat: number; lng: number };
  /** Where the route ends. Omitted = round trip back to the origin. An
   *  "order" destination is pinned as the final stop. */
  destination?: RouteDestinationOption;
}

export async function getDayRoute(
  targetDate: string,
  options: GetDayRouteOptions = {},
): Promise<Result<OptimizedRoute, GetDayRouteFailure>> {
  // Resolve the origin: explicit pick → default saved location → legacy env.
  let origin = options.origin;
  if (!origin) {
    const def = await getDefaultSavedLocation();
    if (def) {
      origin = { lat: def.lat, lng: def.lng };
    } else if (env.WAREHOUSE_LAT !== undefined && env.WAREHOUSE_LNG !== undefined) {
      origin = { lat: env.WAREHOUSE_LAT, lng: env.WAREHOUSE_LNG };
    }
  }
  if (!origin) {
    return err(new WarehouseNotConfiguredError());
  }

  const ordersResult = await getDayOrders(targetDate);
  if (isErr(ordersResult)) return ordersResult;
  const orders = ordersResult.value;

  if (orders.length === 0) {
    return err(new NoConfirmedOrdersError(targetDate));
  }

  // Resolve the end point: round trip (default), a saved location, or one of
  // the day's orders (pinned as the final stop, pulled out of the waypoints).
  const resolved = resolveRouteDestination(orders, origin, options.destination);
  const waypointOrders = resolved.waypointOrders;
  // Cap on actual waypoints (the destination is a separate point, not a
  // waypoint), so an order-destination doesn't count against the limit twice.
  if (waypointOrders.length > MAX_WAYPOINTS) {
    return err(
      new TooManyWaypointsError({
        count: waypointOrders.length,
        cap: MAX_WAYPOINTS,
      }),
    );
  }
  if (options.destination?.kind === "order" && !resolved.appendStop) {
    logger.warn(
      { orderId: options.destination.orderId, targetDate },
      "route_destination_order_not_found",
    );
  }

  const directionsResult = await callGoogleDirections({
    origin,
    destination: resolved.destCoord,
    waypoints: waypointOrders.map((o) => ({ lat: o.lat, lng: o.lng })),
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

  // waypointOrder is indices into the input waypoints. Reorder orders +
  // walk legs in route sequence to derive cumulatives + ETAs. legs[i] is
  // the segment FROM stop i TO stop i+1, with leg[0] being origin → stop 1.
  let cumulativeDistanceM = 0;
  let cumulativeDurationS = 0;
  const stops: RouteStop[] = directions.waypointOrder.map((srcIdx, i) => {
    const order = waypointOrders[srcIdx];
    if (!order) {
      throw new Error(`waypointOrder[${i}]=${srcIdx} out of range`);
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
      customer_notes: detail?.customer_notes ?? null,
      lat: order.lat,
      lng: order.lng,
      delivery_address: detail?.delivery_address ?? null,
      delivery_street: order.street,
      apartment_no: order.apartment_no,
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

  // Order destination: append it as the FINAL stop. Its leg is the last one
  // (last waypoint → destination); accumulate so its ETA/cumulatives are right.
  if (resolved.appendStop) {
    const appended = resolved.appendStop;
    const finalLeg = directions.legs[waypointOrders.length];
    const legDistanceM = finalLeg?.distanceM ?? null;
    const legDurationS = finalLeg?.durationS ?? null;
    cumulativeDistanceM += legDistanceM ?? 0;
    cumulativeDurationS += legDurationS ?? 0;
    const etaIso = new Date(startMs + cumulativeDurationS * 1000).toISOString();
    const detail = detailById.get(appended.order_id);
    stops.push({
      sequence: stops.length + 1,
      order_id: appended.order_id,
      order_number: appended.order_number,
      customer_id: appended.customer_id,
      customer_name: `${appended.customer_first_name} ${appended.customer_last_name}`,
      customer_phone: appended.customer_phone,
      customer_notes: detail?.customer_notes ?? null,
      lat: appended.lat,
      lng: appended.lng,
      delivery_address: detail?.delivery_address ?? null,
      delivery_street: appended.street,
      apartment_no: appended.apartment_no,
      delivery_notes: appended.delivery_notes,
      total_minor: appended.total_minor,
      amount_paid_minor: detail?.amount_paid_minor ?? 0,
      items: detail?.items ?? [],
      leg_distance_m: legDistanceM,
      leg_duration_s: legDurationS,
      cumulative_distance_m: cumulativeDistanceM,
      cumulative_duration_s: cumulativeDurationS,
      eta_iso: etaIso,
    });
  }

  // Final leg (to the destination — origin on a round trip, the saved location,
  // or the pinned order) is included in totals + finish ETA.
  const totalDistanceM = directions.legs.reduce((s, l) => s + l.distanceM, 0);
  const totalDurationS = directions.legs.reduce((s, l) => s + l.durationS, 0);
  const finishTimeIso = new Date(startMs + totalDurationS * 1000).toISOString();

  return ok({
    date: targetDate,
    origin,
    destination: resolved.routeDestination,
    stops,
    overview_polyline: directions.overviewPolyline,
    step_polylines: directions.stepPolylines,
    start_time_iso: startTimeIso,
    finish_time_iso: finishTimeIso,
    total_distance_m: totalDistanceM,
    total_duration_s: totalDurationS,
  });
}
