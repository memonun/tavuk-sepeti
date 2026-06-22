import { z } from "zod";

import type { DraftBatch } from "@/features/orders/domain/draft-batch";

export const DRAFT_BATCH_VERSION = 1;

const basketLineSchema = z.object({
  product_key: z.string().min(1),
  quantity: z.number().positive(),
});

const storedBatchSchema = z.object({
  version: z.literal(DRAFT_BATCH_VERSION),
  scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  defaults: z.object({
    timeSlot: z.enum(["morning", "afternoon", "evening"]).nullable(),
    paymentMethod: z.enum(["cash_on_delivery", "bank_transfer"]),
    deliveryFeeMinor: z.number().int().nonnegative(),
  }),
  assignments: z.record(z.string(), z.array(basketLineSchema)),
});

export function parseStoredBatch(raw: unknown): DraftBatch | null {
  const parsed = storedBatchSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { scheduledFor, defaults, assignments } = parsed.data;
  return { scheduledFor, defaults, assignments };
}

export function pruneUnknownProducts(
  batch: DraftBatch,
  validKeys: ReadonlySet<string>,
): DraftBatch {
  const assignments: Record<string, typeof batch.assignments[string]> = {};
  for (const [id, lines] of Object.entries(batch.assignments)) {
    assignments[id] = lines.filter((l) => validKeys.has(l.product_key));
  }
  return { ...batch, assignments };
}
