import { z } from "zod";

/** Supabase `authorization_id` — opaque, so only bound its size/charset. */
export const authorizationIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_\-.]+$/);

export const connectorDecisionSchema = z.object({
  authorization_id: authorizationIdSchema,
  decision: z.enum(["approve", "deny"]),
});

export type ConnectorDecision = z.output<typeof connectorDecisionSchema>;
