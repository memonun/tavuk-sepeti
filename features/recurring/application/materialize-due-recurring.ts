import "server-only";

/**
 * Lazy materialization driver — called at route-page load time.
 *
 * Finds every active template whose `next_run_at` ≤ end of the viewed
 * Istanbul day, generates one order per template (idempotent via the
 * dedupe partial-unique index), then advances `next_run_at` so the
 * template self-schedules. NEVER throws — returns a summary object.
 *
 * Cross-feature imports go through application/ only (ESLint boundaries).
 */
import { getCustomerProductPricesBatchAction } from "@/features/customers/application/customer-price-actions";
import { groupOverridesByCustomer } from "@/features/orders/application/bulk-order-pricing";
import { listActiveProducts } from "@/features/products/application/list-products";
import { computeNextRunAt } from "@/features/recurring/domain/compute-next-run";
import {
  advanceNextRun,
  listDueTemplates,
} from "@/features/recurring/infrastructure/recurring-template.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { logger } from "@/shared/logger";

import { generateOrderForTemplate } from "@/features/recurring/application/generate-order-for-template";

export interface MaterializeSummary {
  due: number;
  generated: number;
  skipped: number;
  failures: Array<{ template_id: string; code: string }>;
}

const ZERO: MaterializeSummary = { due: 0, generated: 0, skipped: 0, failures: [] };

export async function materializeDueRecurring(
  forDate: string,
): Promise<MaterializeSummary> {
  const cutoff = new Date(`${forDate}T23:59:59+03:00`);

  const due = await listDueTemplates(cutoff);
  if (!due.ok) {
    logger.error(
      { code: due.error.code, message: due.error.message },
      "recurring_materialize_list_due_failed",
    );
    return ZERO;
  }

  if (due.value.length === 0) {
    return ZERO;
  }

  const productsR = await listActiveProducts();
  if (!productsR.ok) {
    logger.error(
      { code: productsR.error.code, message: productsR.error.message },
      "recurring_materialize_products_failed",
    );
    return ZERO;
  }

  // Batch-fetch per-customer price overrides (single round-trip).
  const rows = await getCustomerProductPricesBatchAction(
    due.value.map((t) => t.customer_id),
  );
  const overridesByCustomer = groupOverridesByCustomer(rows);

  // The "generation instant" for next-run computation: the forDate at 06:00 Istanbul.
  const runInstant = new Date(`${forDate}T06:00:00+03:00`);

  let generated = 0;
  let skipped = 0;
  const failures: Array<{ template_id: string; code: string }> = [];

  for (const tpl of due.value) {
    try {
      const r = await generateOrderForTemplate(
        tpl,
        productsR.value,
        overridesByCustomer.get(tpl.customer_id) ?? {},
        forDate,
        null,
      );

      if (r.ok) {
        await advanceNextRun(
          tpl.id,
          computeNextRunAt(
            tpl.cadence,
            { dayOfWeek: tpl.day_of_week, dayOfMonth: tpl.day_of_month },
            runInstant,
          ),
        );
        generated++;
        await logAudit({
          actor_id: null,
          action: "recurring.order_generated",
          entity_type: "order",
          entity_id: r.value.order_id,
          after: { recurring_template_id: tpl.id, scheduled_for: forDate },
        });
      } else {
        skipped++;
        failures.push({ template_id: tpl.id, code: r.error.code });
        logger.warn(
          {
            template_id: tpl.id,
            code: r.error.code,
            message: r.error.message,
          },
          "recurring_materialize_template_skipped",
        );
      }
    } catch (thrown: unknown) {
      skipped++;
      const code =
        thrown instanceof Error ? (thrown as { code?: string }).code ?? thrown.name : "UNKNOWN";
      failures.push({ template_id: tpl.id, code: String(code) });
      logger.warn(
        {
          template_id: tpl.id,
          error: thrown instanceof Error ? thrown.message : String(thrown),
        },
        "recurring_materialize_template_threw",
      );
    }
  }

  logger.info(
    { due: due.value.length, generated, skipped },
    "recurring_materialize",
  );

  return { due: due.value.length, generated, skipped, failures };
}
