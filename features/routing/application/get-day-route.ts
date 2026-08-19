import "server-only";

/**
 * Optimize the day's deliveries via the Google Routes API (computeRoutes).
 *
 * Pipeline:
 *   1. Resolve the warehouse origin from env. If missing → typed error.
 *   2. Fetch the day's orders via getDayOrders.
 *   3. Reject if zero orders or > the defensive per-day ceiling.
 *   4. Split into chunks of at most 25 stops each (Google's real
 *      computeRoutes cap — see chunk-waypoints.ts) and call
 *      callGoogleDirections for every chunk in parallel.
 *   5. Walk each chunk's legs in order, continuing one running cumulative
 *      distance/duration/sequence across chunk boundaries, to compute ETA
 *      per stop anchored to `startTimeIso` (default = now).
 *   6. Return OptimizedRoute with step polylines for high-fidelity render.
 *
 * A single chunk (≤25 stops, the common case) behaves exactly as a plain
 * one-shot computeRoutes call always has — chunking only changes anything
 * once a day has more than 25 stops.
 *
 * Faz 2 will replace this chunked heuristic with a proper VRP solver
 * (multiple vehicles / time windows); spec §7.2 calls it a stop-gap.
 */
import { getDayOrders } from "@/features/routing/application/get-day-orders";
import { planWaypointChunks } from "@/features/routing/domain/chunk-waypoints";
import { nearestNeighborOrder } from "@/features/routing/domain/nearest-neighbor-order";
import { partitionDeliveredOrders } from "@/features/routing/domain/partition-delivered-orders";
import { resolveRouteDestination } from "@/features/routing/domain/route-destination";
import { routeFinishMs, stopEtaMs } from "@/features/routing/domain/route-schedule";
import {
  DirectionsApiError,
  NoConfirmedOrdersError,
  TooManyWaypointsError,
  WarehouseNotConfiguredError,
} from "@/features/routing/domain/route.errors";
import { stitchChunkedRoute } from "@/features/routing/domain/stitch-chunked-route";
import { callGoogleDirections } from "@/features/routing/infrastructure/google-directions";
import { fetchDeliveryDetails } from "@/features/routing/infrastructure/order-delivery-details";
import { persistStopEtas } from "@/features/routing/infrastructure/order-eta.repository";
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
import type { DirectionsResult } from "@/features/routing/infrastructure/google-directions";

// A single computeRoutes request supports at most 25 intermediate waypoints —
// a real Google limit (see ../infrastructure/google-directions.ts), not
// something this app chose. A day with more stops is split into multiple
// chained computeRoutes calls instead of failing outright.
const GOOGLE_CHUNK_SIZE = 25;

// Defensive ceiling on total stops per day. Not a Google limit — just a sane
// bound so a data mistake can't silently fan out into dozens of parallel
// paid Directions calls. Comfortably above any realistic single-van day.
const MAX_WAYPOINTS = 300;

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
  /** Order ids to keep OUT of the optimized waypoints (already-delivered stops),
   *  surfaced instead as `completed_markers`. Frozen by the caller in the route
   *  URL so it stays stable across refreshes (see partition-delivered-orders.ts).
   *  Omitted = optimize every order for the day. */
  excludeOrderIds?: readonly string[];
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

  // Pull already-delivered stops OUT of the optimizable set so the optimizer
  // never sequences the drive through a place the driver has already been (and,
  // on a re-optimize from the live position, never routes them backwards). They
  // ride along as muted map markers. The excluded set is frozen by the caller
  // (route URL), not read live from status, so the waypoint set — and thus the
  // Directions cache key — stays stable across the refresh after each delivery:
  // no Google call, no reshuffle. See partition-delivered-orders.ts.
  const { routed, completedMarkers } = partitionDeliveredOrders(
    orders,
    options.excludeOrderIds ?? [],
  );

  if (routed.length === 0) {
    // Every order for the day is already delivered — nothing left to route.
    return err(new NoConfirmedOrdersError(targetDate));
  }

  // Resolve the end point: round trip (default), a saved location, or one of
  // the day's orders (pinned as the final stop, pulled out of the waypoints).
  const resolved = resolveRouteDestination(routed, origin, options.destination);
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

  // Nearest-neighbor pre-sort only matters for CHUNK MEMBERSHIP once there's
  // more than one chunk — within a single chunk (the common case) Google's
  // own optimizeWaypointOrder reorders freely regardless of input order.
  const orderedWaypoints =
    waypointOrders.length > GOOGLE_CHUNK_SIZE
      ? nearestNeighborOrder(origin, waypointOrders)
      : waypointOrders;
  const chunkPlans = planWaypointChunks(
    origin,
    orderedWaypoints,
    resolved.destCoord,
    GOOGLE_CHUNK_SIZE,
  );

  const chunkResults = await Promise.all(
    chunkPlans.map((chunk) =>
      callGoogleDirections({
        origin: chunk.origin,
        destination: chunk.destination,
        waypoints: chunk.intermediates.map((o) => ({ lat: o.lat, lng: o.lng })),
      }),
    ),
  );
  const chunkDirections: DirectionsResult[] = [];
  for (const result of chunkResults) {
    if (isErr(result)) return result;
    chunkDirections.push(result.value);
  }

  // Enrich with paid amount + line items (one batched lookup for the route).
  // Only the routed stops need details — completed markers are pins, not stops.
  const detailById = await fetchDeliveryDetails(routed.map((o) => o.order_id));

  // Anchor for ETAs. If the supplied start is malformed, fall back to now —
  // never throw on bad UI input.
  const startMs = (() => {
    if (!options.startTimeIso) return Date.now();
    const parsed = Date.parse(options.startTimeIso);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  })();
  const startTimeIso = new Date(startMs).toISOString();

  // Turn the per-chunk Google results back into one continuous stop
  // sequence with one running cumulative distance/duration (chunk-boundary
  // index math lives in stitch-chunked-route.ts, unit-tested there).
  const stitched = stitchChunkedRoute(
    chunkPlans,
    chunkDirections,
    resolved.appendStop,
  );
  const stops: RouteStop[] = stitched.map((s, i) => {
    const order = s.item;
    // sequence is i+1 (1-indexed) — see route-schedule.ts for why dwell at
    // stop i+1's own visit isn't added to its own ETA.
    const etaIso = new Date(stopEtaMs(startMs, s.cumulativeDurationS, i + 1)).toISOString();
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
      building_no: order.building_no,
      apartment_no: order.apartment_no,
      in_service_area: order.in_service_area,
      delivery_notes: order.delivery_notes,
      total_minor: order.total_minor,
      amount_paid_minor: detail?.amount_paid_minor ?? 0,
      items: detail?.items ?? [],
      leg_distance_m: s.legDistanceM,
      leg_duration_s: s.legDurationS,
      cumulative_distance_m: s.cumulativeDistanceM,
      cumulative_duration_s: s.cumulativeDurationS,
      eta_iso: etaIso,
    };
  });

  // Totals + finish ETA across every chunk's legs, including each chunk's
  // final leg to its destination (the last chunk's is the route's own end).
  const allLegs = chunkDirections.flatMap((d) => d.legs);
  const totalDistanceM = allLegs.reduce((s, l) => s + l.distanceM, 0);
  const totalDurationS = allLegs.reduce((s, l) => s + l.durationS, 0);
  // finish_time_iso (unlike total_duration_s, which stays pure driving time —
  // see route-schedule.ts) includes dwell at every stop, so it's the real
  // "when is the driver actually done" estimate.
  const finishTimeIso = new Date(
    routeFinishMs(startMs, totalDurationS, stops.length),
  ).toISOString();

  // Best-effort — persistStopEtas swallows its own errors (logs + returns),
  // so a write hiccup here never fails the admin's route view. Piggybacks on
  // this exact optimization call: zero new Google API usage, and the
  // customer-facing lookup (features/storefront) reads whatever landed here.
  await persistStopEtas(stops.map((s) => ({ order_id: s.order_id, eta_iso: s.eta_iso })));

  return ok({
    date: targetDate,
    origin,
    destination: resolved.routeDestination,
    stops,
    completed_markers: completedMarkers,
    // Google's simplified summary polyline, kept only as a low-zoom fallback
    // (nothing in the UI actually renders it — step_polylines below is what
    // route-map.tsx draws). Encoded polylines can't be naively concatenated
    // across chunks, so on a multi-chunk day this is just the last chunk's;
    // step_polylines stays complete and accurate regardless of chunk count.
    overview_polyline: chunkDirections[chunkDirections.length - 1]!.overviewPolyline,
    step_polylines: chunkDirections.flatMap((d) => d.stepPolylines),
    start_time_iso: startTimeIso,
    finish_time_iso: finishTimeIso,
    total_distance_m: totalDistanceM,
    total_duration_s: totalDurationS,
  });
}
