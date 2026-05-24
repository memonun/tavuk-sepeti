/**
 * Zod schemas for the views feature — single source of truth for both
 * the UI (view create/rename forms) and the Server Actions.
 *
 * The `config` jsonb column is parsed defensively on read so a manually
 * tampered DB row or a stale shape from an old build can't crash the
 * grid; on write the same schema enforces the canonical structure.
 */
import { z } from "zod";

import type { ViewConfig } from "@/features/views/domain/view";

const tableIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, "Geçersiz tablo kimliği.");

const nameSchema = z
  .string()
  .trim()
  .min(1, "Görünüm adı gerekli.")
  .max(80, "Görünüm adı 80 karakteri geçemez.");

/** Per-column UI state stored inside the view config. */
const columnStateSchema = z.object({
  sizes: z.record(z.string(), z.number().int().positive()).default({}),
  order: z.array(z.string()).default([]),
  hidden: z.array(z.string()).default([]),
  pinning: z
    .object({
      left: z.array(z.string()).default([]),
      right: z.array(z.string()).default([]),
    })
    .default({ left: [], right: [] }),
  aggregates: z.record(z.string(), z.string()).default({}),
});

export const viewConfigSchema: z.ZodType<ViewConfig> = z
  .object({
    filters: z.record(z.string(), z.string()).default({}),
    sort: z
      .object({
        column: z.string(),
        order: z.enum(["asc", "desc"]),
      })
      .nullable()
      .default(null),
    groupBy: z.string().nullable().default(null),
    columnState: columnStateSchema.default({
      sizes: {},
      order: [],
      hidden: [],
      pinning: { left: [], right: [] },
      aggregates: {},
    }),
  })
  .strip() as unknown as z.ZodType<ViewConfig>;

/** Payload accepted by the create-view Server Action. */
export const createViewSchema = z.object({
  table_id: tableIdSchema,
  name: nameSchema,
  config: viewConfigSchema,
  is_default: z.boolean().default(false),
});
export type CreateViewInput = z.output<typeof createViewSchema>;

/** Payload accepted by the update-view Server Action. */
export const updateViewSchema = z.object({
  id: z.string().uuid(),
  name: nameSchema.optional(),
  config: viewConfigSchema.optional(),
  is_default: z.boolean().optional(),
});
export type UpdateViewInput = z.output<typeof updateViewSchema>;
