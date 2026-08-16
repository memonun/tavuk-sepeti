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

import type { Json } from "@/shared/supabase/types";

export type AuditAction =
  | "customer.created"
  | "customer.updated"
  | "customer.deleted"
  | "order.created"
  | "order.bulk_created"
  | "order.transitioned"
  | "order.delivery_reverted"
  | "order.cargo_info_updated"
  | "order.updated"
  | "order.deleted"
  | "product.created"
  | "product.updated"
  | "product.archived"
  | "payment.recorded"
  | "payment.deleted"
  // PayTR webhook outcomes that leave no other durable trace. A successful
  // capture needs none — it becomes an order_payments row.
  | "payment.card_failed"
  | "payment.card_amount_mismatch"
  | "recurring.created"
  | "recurring.updated"
  | "recurring.paused"
  | "recurring.resumed"
  | "recurring.deleted"
  | "recurring.order_generated"
  // Storefront (customer-initiated). The actor is the customer's auth user,
  // not an admin — before this the web order path wrote no audit trail at all.
  | "order.web_placed"
  | "customer.web_registered"
  | "address.web_updated"
  // Shop rules the owner edits (delivery days, cargo order floor). Worth an
  // audit row: a changed delivery day silently reshapes every future checkout.
  | "storefront_settings.updated";

export type AuditEntityType =
  | "customer"
  | "order"
  | "address"
  | "product"
  | "recurring_template"
  | "storefront_settings";

/**
 * `audit_log.entity_id` is a uuid column, but a singleton config row has no
 * uuid of its own. The nil UUID is the conventional stand-in — it identifies
 * "the one and only row of this entity type" and can never collide with a
 * generated id.
 */
export const SINGLETON_ENTITY_ID = "00000000-0000-0000-0000-000000000000";

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
  const { error } = await supabase.from("audit_log").insert(
    inputs.map((input) => ({
      actor_id: input.actor_id,
      action: input.action,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      // The Json type from supabase types is strictly recursive
      // (string | number | boolean | null | { [k]: Json } | Json[]).
      // Callers pass in Record<string, unknown> for ergonomic reasons
      // — runtime values are always Json-safe (no functions, no
      // Symbols, etc.) so the cast at the boundary is sound.
      before: (input.before ?? null) as Json,
      after: (input.after ?? null) as Json,
      metadata: (input.metadata ?? null) as Json,
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
