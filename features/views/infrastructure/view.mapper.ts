/**
 * DB row ↔ View domain entity mapping. The `customer_views` table isn't
 * yet in the generated Database type (the migration is fresh; run
 * `pnpm db:types` to regenerate). Until then we narrow at this single
 * boundary with a typed row shape and keep the rest of the codebase
 * Postgres-free.
 */
import { EMPTY_VIEW_CONFIG, type View } from "@/features/views/domain/view";
import { viewConfigSchema } from "@/features/views/domain/view.schema";
import { logger } from "@/shared/logger";

export interface ViewRow {
  id: string;
  table_id: string;
  owner_id: string;
  name: string;
  config: unknown;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export function rowToView(row: ViewRow): View {
  // Defensive parse — a manually-tampered config jsonb or a stale
  // shape from an older deploy collapses to the empty config rather
  // than blowing up the grid render.
  const parsed = viewConfigSchema.safeParse(row.config);
  if (!parsed.success) {
    logger.warn(
      { viewId: row.id, tableId: row.table_id },
      "view_config_invalid_fallback_to_empty",
    );
  }
  return {
    id: row.id,
    tableId: row.table_id,
    ownerId: row.owner_id,
    name: row.name,
    config: parsed.success ? parsed.data : EMPTY_VIEW_CONFIG,
    isDefault: row.is_default,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
