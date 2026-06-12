/**
 * Saved start location for route optimization — a named point the driver can
 * pick as the route origin (warehouse, depot, etc.). One row is the default.
 *
 * Coordinates mirror the addresses convention (lat/lng as plain numbers).
 */
import { z } from "zod";

export interface SavedLocation {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly is_default: boolean;
}

/** Parses a DB row (external boundary) into the domain entity. */
export const savedLocationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  lat: z.coerce.number().gte(-90).lte(90),
  lng: z.coerce.number().gte(-180).lte(180),
  is_default: z.boolean(),
});

export type SavedLocationRow = z.input<typeof savedLocationSchema>;
