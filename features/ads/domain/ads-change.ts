/**
 * One row of the append-only `meta_ads_changes` log — the owner's report.
 * Parsed at the database boundary (CLAUDE.md §3).
 */
import { z } from "zod";

export const adsChangeRowSchema = z.object({
  id: z.string().uuid(),
  entity_id: z.string(),
  entity_level: z.enum(["campaign", "adset", "ad"]),
  entity_name: z.string(),
  action: z.enum(["budget", "pause", "resume", "create"]),
  before_daily_budget_minor: z.coerce.number().nullable(),
  after_daily_budget_minor: z.coerce.number().nullable(),
  reason: z.string(),
  source: z.enum(["mcp", "panel"]),
  created_at: z.string(),
});

export type AdsChangeRow = z.infer<typeof adsChangeRowSchema>;
