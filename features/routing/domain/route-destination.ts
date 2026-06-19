/**
 * Pure resolver for a route's final destination.
 *
 * A route can end three ways: back at the start (round trip — the default and
 * legacy behavior), at a saved location, or at one of the day's delivery
 * orders. When it ends at an order, that order is pulled OUT of the optimizable
 * waypoints and pinned as the final stop, so the rest of the route optimizes
 * around ending there.
 *
 * Kept pure (no IO/logging) so it's trivially unit-testable; the application
 * layer logs the order-not-found fallback.
 */
import type { RouteDestination } from "@/features/routing/domain/route";

/** Minimal order shape the resolver needs. DayOrder is structurally assignable. */
export interface RouteDestinationCandidate {
  readonly order_id: string;
  readonly lat: number;
  readonly lng: number;
  readonly customer_first_name: string;
  readonly customer_last_name: string;
}

export type RouteDestinationOption =
  | { readonly kind: "location"; readonly lat: number; readonly lng: number; readonly name: string }
  | { readonly kind: "order"; readonly orderId: string };

export interface ResolvedRouteDestination<T extends RouteDestinationCandidate> {
  /** What to pass to Google Directions as the `destination`. */
  readonly destCoord: { readonly lat: number; readonly lng: number };
  /** Orders to optimize as waypoints (order-destination removed). */
  readonly waypointOrders: T[];
  /** The order to append as the final stop, or null (round trip / location). */
  readonly appendStop: T | null;
  /** Destination metadata for the route, or null for a round trip. */
  readonly routeDestination: RouteDestination | null;
}

export function resolveRouteDestination<T extends RouteDestinationCandidate>(
  orders: readonly T[],
  origin: { readonly lat: number; readonly lng: number },
  option: RouteDestinationOption | undefined,
): ResolvedRouteDestination<T> {
  // Round trip — default + legacy behavior.
  if (!option) {
    return {
      destCoord: { lat: origin.lat, lng: origin.lng },
      waypointOrders: [...orders],
      appendStop: null,
      routeDestination: null,
    };
  }

  if (option.kind === "location") {
    return {
      destCoord: { lat: option.lat, lng: option.lng },
      waypointOrders: [...orders],
      appendStop: null,
      routeDestination: {
        kind: "location",
        lat: option.lat,
        lng: option.lng,
        name: option.name,
      },
    };
  }

  // kind === "order"
  const target = orders.find((o) => o.order_id === option.orderId);
  if (!target) {
    // Chosen order isn't in the day's list (already delivered / wrong date).
    // Fall back to a round trip rather than failing the whole route.
    return {
      destCoord: { lat: origin.lat, lng: origin.lng },
      waypointOrders: [...orders],
      appendStop: null,
      routeDestination: null,
    };
  }

  const name =
    `${target.customer_first_name} ${target.customer_last_name}`.trim();
  return {
    destCoord: { lat: target.lat, lng: target.lng },
    waypointOrders: orders.filter((o) => o.order_id !== option.orderId),
    appendStop: target,
    routeDestination: {
      kind: "order",
      lat: target.lat,
      lng: target.lng,
      name,
      order_id: target.order_id,
    },
  };
}
