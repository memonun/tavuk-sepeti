/**
 * Zod schemas for Coordinate. Used at every boundary that takes user-typed
 * lat/lng (admin pin corrector, server actions). The `Coordinate` interface
 * in coordinate.ts is the type these schemas produce.
 */
import { z } from "zod";

export const coordinateSourceSchema = z.enum([
  "geocoded_auto",
  "geocoded_manual",
  "user_pin",
  "admin_corrected",
]);

export const coordinateAccuracySchema = z.enum([
  "rooftop",
  "range_interpolated",
  "geometric_center",
  "approximate",
  "unknown",
]);

/** Bare lat/lng pair — what the pin corrector emits when the user drags. */
export const latLngSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
});

/** Full coordinate envelope — what the application layer hands the repo. */
export const coordinateSchema = latLngSchema.extend({
  source: coordinateSourceSchema,
  accuracy: coordinateAccuracySchema,
  geocoded_at: z.date().nullable(),
  geocoder_response_hash: z.string().min(1).nullable(),
});

export type LatLng = z.infer<typeof latLngSchema>;
