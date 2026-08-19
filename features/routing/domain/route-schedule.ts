/**
 * Adds a fixed dwell time at every delivery stop to the driving-only
 * cumulative durations `stitchChunkedRoute` produces, so `eta_iso` and
 * `finish_time_iso` reflect time actually spent handing over an order — not
 * just drive time. Deliberately a flat per-stop constant driven by stop
 * count, not live GPS/API data (owner instruction, 2026-08-19: no extra
 * Google API load/cost for this).
 *
 * `leg_duration_s` / `cumulative_duration_s` / `total_duration_s` are left
 * untouched on purpose — route-list.tsx labels cumulative_duration_s
 * "Toplam yolda" (time actually on the road), which dwell time is not.
 * Only the two clock-time estimates (`eta_iso`, `finish_time_iso`) change.
 */

/** Minutes an admin/driver typically spends handing over one order —
 *  payment, a short chat, walking to the door. Flat for every stop; no
 *  per-stop override yet. */
export const STOP_DWELL_SECONDS = 10 * 60;

/**
 * `sequence - 1` = stops already serviced before departing toward this one —
 * dwell at the stop currently being arrived at hasn't happened yet, so it
 * isn't added to that stop's own ETA (sequence is 1-indexed, matching
 * RouteStop.sequence).
 */
export function stopEtaMs(
  startMs: number,
  cumulativeDurationS: number,
  sequence: number,
): number {
  return startMs + cumulativeDurationS * 1000 + (sequence - 1) * STOP_DWELL_SECONDS * 1000;
}

/**
 * The route isn't "finished" until the driver has also handed over the
 * last order — dwell at every stop counts here, including the last one,
 * even when the route ends AT that stop (no driving leg follows it).
 */
export function routeFinishMs(
  startMs: number,
  totalDurationS: number,
  stopCount: number,
): number {
  return startMs + totalDurationS * 1000 + stopCount * STOP_DWELL_SECONDS * 1000;
}
