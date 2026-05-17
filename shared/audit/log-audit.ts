/**
 * Cross-entity audit logger. SPEC.md §9.3.
 *
 * Every mutating Server Action writes one row via this helper. Failures
 * are logged + swallowed: a telemetry hiccup must never roll back the
 * user's actual transaction. The corresponding success has already been
 * persisted by the caller before logAudit is invoked.
 *
 * Action strings follow `entity.verb` convention (e.g., "customer.created",
 * "order.transitioned"). Keeping a typed union here means a typo at the
 * call site fails type-check rather than scattering free strings across
 * the codebase.
 */
import "server-only";

import { logger } from "@/shared/logger";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";

export type AuditAction =
  | "customer.created"
  | "customer.updated"
  | "customer.deleted"
  | "order.created"
  | "order.transitioned";

export type AuditEntityType = "customer" | "order" | "address";

export interface LogAuditInput {
  actor_id: string | null;
  action: AuditAction;
  entity_type: AuditEntityType;
  entity_id: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export async function logAudit(input: LogAuditInput): Promise<void> {
  await logBulkAudit([input]);
}

/**
 * Batched variant — writes all rows in a single INSERT. Use when a
 * single mutation affects many entities (bulk delete, paste-create);
 * the per-row variant fans out into N round-trips which doesn't
 * survive the §1 paranoyak ölçek bar.
 */
export async function logBulkAudit(
  inputs: ReadonlyArray<LogAuditInput>,
): Promise<void> {
  if (inputs.length === 0) return;
  const supabase = getSupabaseAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("audit_log").insert(
    inputs.map((input) => ({
      actor_id: input.actor_id,
      action: input.action,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      before: input.before ?? null,
      after: input.after ?? null,
      metadata: input.metadata ?? null,
    })),
  );
  if (error) {
    // Swallow + log. The caller's mutation has already succeeded; failing
    // to write the audit row is a degraded telemetry path, not a user-
    // facing error.
    logger.warn(
      {
        count: inputs.length,
        sampleAction: inputs[0]?.action,
        sampleEntityId: inputs[0]?.entity_id,
        code: error.code,
        message: error.message,
      },
      "audit_log_write_failed",
    );
  }
}
