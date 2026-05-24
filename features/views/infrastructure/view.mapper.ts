/**
 * DB row ↔ View domain entity mapping. The only place in the codebase
 * that knows about the supabase-js Row shape for customer_views.
 */
import { EMPTY_VIEW_CONFIG, type View } from "@/features/views/domain/view";
import { viewConfigSchema } from "@/features/views/domain/view.schema";
import { logger } from "@/shared/logger";

import type { Database } from "@/shared/supabase/types";

export type ViewRow = Database["public"]["Tables"]["customer_views"]["Row"];

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
