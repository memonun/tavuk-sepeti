import "server-only";

/**
 * Lazy materialization driver — called at Finans page-load time (Giderler /
 * Rutin Giderler / Finans Özeti), mirroring
 * features/recurring/application/materialize-due-recurring.ts's shape
 * exactly: find every active template due on/before the viewed day,
 * generate one pending expense per template (idempotent via
 * generate_recurring_expense's pre-check + the DB partial-unique index),
 * then advance next_run_at. NEVER throws — returns a summary object.
 *
 * No cron: reusing the same lazy-on-view materialization the orders
 * recurring feature already relies on (spec §14 — don't depend on an
 * external cron unless the repo already has one; it doesn't).
 */
import { toRecurrenceCadence } from "@/features/finance/domain/recurring-expense-template";
import {
  advanceNextRun,
  generateRecurringExpense,
  listDueTemplates,
} from "@/features/finance/infrastructure/recurring-expense-template.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { logger } from "@/shared/logger";
import { toIstanbulDateString } from "@/shared/utils/date";
import { computeNextRunAt } from "@/shared/utils/recurrence";

export interface MaterializeExpenseSummary {
  due: number;
  generated: number;
  skipped: number;
}

const ZERO: MaterializeExpenseSummary = { due: 0, generated: 0, skipped: 0 };

export async function materializeDueRecurringExpenses(
  forDate: string,
): Promise<MaterializeExpenseSummary> {
  const cutoff = new Date(`${forDate}T23:59:59+03:00`);

  const due = await listDueTemplates(cutoff);
  if (!due.ok) {
    logger.error(
      { code: due.error.code, message: due.error.message },
      "recurring_expense_materialize_list_due_failed",
    );
    return ZERO;
  }
  if (due.value.length === 0) return ZERO;

  let generated = 0;
  let skipped = 0;

  for (const tpl of due.value) {
    try {
      // The occurrence lands on the template's OWN due day, not "today" —
      // next_run_at may be a past date if the page wasn't opened for a
      // while, and the generated row must reflect that real date, not the
      // day someone happened to look.
      const occurrenceDate = toIstanbulDateString(tpl.next_run_at);

      // Past its Bitiş Tarihi: never generate (and never advance) — a
      // template with an end_date simply stops producing occurrences once
      // its schedule runs past it, without requiring the admin to remember
      // to pause it manually.
      if (tpl.end_date !== null && occurrenceDate > tpl.end_date) {
        continue;
      }

      const generatedRes = await generateRecurringExpense(tpl.id, occurrenceDate, null);
      if (!generatedRes.ok) {
        skipped++;
        logger.warn(
          { template_id: tpl.id, code: generatedRes.error.code },
          "recurring_expense_materialize_generate_failed",
        );
        continue;
      }

      const { kind, shape } = toRecurrenceCadence(tpl.cadence, tpl.day_of_week, tpl.day_of_month);
      const nextRun = computeNextRunAt(kind, shape, tpl.next_run_at);

      const advanced = await advanceNextRun(tpl.id, nextRun);
      if (!advanced.ok) {
        skipped++;
        logger.warn(
          { template_id: tpl.id, code: advanced.error.code },
          "recurring_expense_materialize_advance_failed",
        );
        continue;
      }

      generated++;
      await logAudit({
        actor_id: null,
        action: "recurring_expense.generated",
        entity_type: "expense",
        entity_id: generatedRes.value.expense_id,
        after: { recurring_template_id: tpl.id, expense_date: occurrenceDate },
      });
    } catch (thrown: unknown) {
      skipped++;
      logger.warn(
        { template_id: tpl.id, error: thrown instanceof Error ? thrown.message : String(thrown) },
        "recurring_expense_materialize_threw",
      );
    }
  }

  logger.info({ due: due.value.length, generated, skipped }, "recurring_expense_materialize");
  return { due: due.value.length, generated, skipped };
}
