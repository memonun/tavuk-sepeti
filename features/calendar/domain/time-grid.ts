/**
 * Geometry of the day / week time grid: where a timed occurrence sits within
 * one day's 24 hours, and how overlapping ones share the width. Pure — the
 * component only turns these numbers into CSS.
 */
import { istanbulInstant } from "@/shared/utils/date";

import type { EventOccurrence } from "@/features/calendar/domain/calendar";

export const MINUTES_PER_DAY = 1440;

/** Shorter events are drawn (and collide) as if they lasted this long, so a
 *  5-minute event is still a readable, tappable block. */
export const MIN_SEGMENT_MINUTES = 30;

/** The part of one occurrence that falls inside one day. */
export interface DaySegment<T = EventOccurrence> {
  readonly item: T;
  /** Minutes from that day's Istanbul midnight, 0..1440. */
  readonly startMin: number;
  readonly endMin: number;
}

export interface PlacedSegment<T = EventOccurrence> extends DaySegment<T> {
  /** 0-based column inside its overlap cluster. */
  readonly column: number;
  /** How many columns that cluster has. */
  readonly columns: number;
}

/** The slice of a timed span that lies within `day`, or null if none does. */
export function clipToDay(
  startsAt: string,
  endsAt: string,
  day: string,
): { startMin: number; endMin: number } | null {
  const dayStart = istanbulInstant(day).getTime();
  const startMin = Math.max(0, Math.round((new Date(startsAt).getTime() - dayStart) / 60_000));
  const endMin = Math.min(
    MINUTES_PER_DAY,
    Math.round((new Date(endsAt).getTime() - dayStart) / 60_000),
  );
  if (startMin >= MINUTES_PER_DAY || endMin <= 0 || endMin <= startMin) return null;
  return { startMin, endMin };
}

/** The timed occurrences of one day as segments (all-day ones are excluded —
 *  they live in the strip above the grid). */
export function daySegments(
  occurrences: readonly EventOccurrence[],
  day: string,
): DaySegment[] {
  const segments: DaySegment[] = [];
  for (const occurrence of occurrences) {
    if (occurrence.all_day) continue;
    const clipped = clipToDay(occurrence.starts_at, occurrence.ends_at, day);
    if (clipped) segments.push({ item: occurrence, ...clipped });
  }
  return segments;
}

function visualEnd(segment: { startMin: number; endMin: number }): number {
  return Math.max(segment.endMin, segment.startMin + MIN_SEGMENT_MINUTES);
}

/**
 * Assigns each segment a column so overlapping ones sit side by side. Segments
 * are grouped into clusters of transitively overlapping blocks; inside a
 * cluster each takes the leftmost column that is free at its start, and every
 * member reports the cluster's column count so they all get the same width.
 */
export function layoutDaySegments<T>(segments: readonly DaySegment<T>[]): PlacedSegment<T>[] {
  const sorted = [...segments].sort(
    (a, b) => a.startMin - b.startMin || visualEnd(b) - visualEnd(a),
  );

  const placed: PlacedSegment<T>[] = [];
  let cluster: { segment: DaySegment<T>; column: number }[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    for (const { segment, column } of cluster) {
      placed.push({ ...segment, column, columns: columnEnds.length });
    }
    cluster = [];
    columnEnds = [];
  };

  for (const segment of sorted) {
    if (cluster.length > 0 && segment.startMin >= clusterEnd) flush();
    let column = columnEnds.findIndex((end) => end <= segment.startMin);
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = visualEnd(segment);
    cluster.push({ segment, column });
    clusterEnd = Math.max(cluster.length === 1 ? -1 : clusterEnd, visualEnd(segment));
  }
  flush();
  return placed;
}
