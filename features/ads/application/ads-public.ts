/**
 * The ads feature's public input rules, for other features (the MCP tools)
 * that may only import application/ (CLAUDE.md §2). Pure re-exports.
 */
export {
  CALL_TO_ACTIONS,
  CAMPAIGN_OBJECTIVES,
  createAdSchema,
  createAdSetSchema,
  createCampaignSchema,
} from "@/features/ads/domain/ads-creation";
