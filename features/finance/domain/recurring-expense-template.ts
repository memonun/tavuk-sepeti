/**
 * Recurring expense template — a schedule that lazily generates ordinary
 * `expenses` rows (features/finance/domain/expense.ts), never a second
 * financial source of truth. Mirrors the architectural shape of
 * features/recurring/domain/recurring-template.ts (customer orders): the
 * template is the "set once" intent, generated rows are frozen historical
 * facts once they exist.
 *
 * Cadence-shape invariant (enforced in DB CHECK + the Zod schema):
 *   weekly                                   -> day_of_week set (0=Sun..6=Sat), day_of_month null
 *   monthly | quarterly | semiannual | yearly -> day_of_month set (1..31), day_of_week null
 *
 * A generated occurrence always starts `payment_status: "pending"` — never
 * auto-paid (spec §12). Fixed vs. variable only changes what the *template*
 * calls its amount ("Sabit Tutar" vs. "Tahmini Tutar"); once generated, the
 * expense row is edited through the normal expense flow like any other.
 */
import type { ManualPaymentMethod } from "@/features/finance/domain/expense";
import type { RecurrenceCadenceKind, RecurrenceShape } from "@/shared/utils/recurrence";

export type RecurringExpenseCadence = "weekly" | "monthly" | "quarterly" | "semiannual" | "yearly";
export type RecurringExpenseAmountType = "fixed" | "variable";

export const RECURRING_EXPENSE_CADENCE_LABELS: Readonly<Record<RecurringExpenseCadence, string>> = {
  weekly: "Haftalık",
  monthly: "Aylık",
  quarterly: "3 Aylık",
  semiannual: "6 Aylık",
  yearly: "Yıllık",
};

export const RECURRING_EXPENSE_AMOUNT_TYPE_LABELS: Readonly<Record<RecurringExpenseAmountType, string>> = {
  fixed: "Sabit Tutar",
  variable: "Değişken Tutar",
};

export interface RecurringExpenseTemplate {
  readonly id: string;
  readonly name: string;
  readonly category_id: string;
  readonly vendor: string | null;
  readonly description: string | null;
  readonly amount_type: RecurringExpenseAmountType;
  readonly default_amount_minor: number;
  readonly cadence: RecurringExpenseCadence;
  readonly day_of_week: number | null;
  readonly day_of_month: number | null;
  readonly start_date: string; // YYYY-MM-DD
  readonly end_date: string | null;
  readonly payment_method: ManualPaymentMethod | null;
  readonly active: boolean;
  readonly note: string | null;
  readonly next_run_at: Date;
  readonly created_by: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/** Compact projection for the Rutin Giderler table. */
export interface RecurringExpenseTemplateListItem {
  readonly id: string;
  readonly name: string;
  readonly category_id: string;
  readonly category_name: string;
  readonly category_parent_name: string | null;
  readonly vendor: string | null;
  readonly amount_type: RecurringExpenseAmountType;
  readonly default_amount_minor: number;
  readonly cadence: RecurringExpenseCadence;
  readonly day_of_week: number | null;
  readonly day_of_month: number | null;
  readonly active: boolean;
  readonly next_run_at: Date;
  readonly end_date: string | null;
}

/** Preview row for "Yaklaşan Rutin Giderler" (Finans Özeti, spec §20) — the
 *  template's OWN next_run_at, never a DB write. `~` in the UI when
 *  amount_type is "variable" (it's an estimate, not a firm figure yet). */
export interface UpcomingRecurringExpense {
  readonly templateId: string;
  readonly name: string;
  readonly categoryLabel: string;
  readonly amountMinor: number;
  readonly isEstimate: boolean;
  readonly nextRunAt: Date;
}

/** Maps this feature's 5-cadence vocabulary onto shared/utils/recurrence.ts's
 *  generic {kind, intervalWeeks|intervalMonths} shape — the same reuse seam
 *  features/recurring/domain/compute-next-run.ts uses for weekly/biweekly/monthly. */
export function toRecurrenceCadence(
  cadence: RecurringExpenseCadence,
  dayOfWeek: number | null,
  dayOfMonth: number | null,
): { kind: RecurrenceCadenceKind; shape: RecurrenceShape } {
  if (cadence === "weekly") {
    return { kind: "weekly", shape: { dayOfWeek, intervalWeeks: 1 } };
  }
  const intervalMonths = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 }[cadence];
  return { kind: "monthly", shape: { dayOfMonth, intervalMonths } };
}
