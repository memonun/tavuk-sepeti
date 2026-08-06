/**
 * Result of the delivery service-area check.
 *
 * The `is_within_service_area(lat, lng)` RPC is deliberately three-valued: it
 * returns NULL when no service area has been configured at all, so a seeding
 * mistake can never silently block 100% of route orders. Callers must handle
 * "unconfigured" explicitly — falling back to a province-name compare and
 * logging a warning — rather than coercing NULL to false (blocks everything) or
 * to true (lets every address through unnoticed).
 */
export type ServiceAreaCheck = "inside" | "outside" | "unconfigured";

/** Map the RPC's boolean|null into the explicit three-state type. */
export function serviceAreaCheckFromRpc(
  value: boolean | null | undefined,
): ServiceAreaCheck {
  if (value === true) return "inside";
  if (value === false) return "outside";
  return "unconfigured";
}
