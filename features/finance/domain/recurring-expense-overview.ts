/**
 * "Yaklaşan Rutin Giderler" — the admin Panel's view of what is due to be paid.
 *
 * Two kinds of row, one list, sorted by due day:
 *   - `pending`: a rutin gider that has ALREADY been generated (this month's
 *     bills are materialized as soon as the month starts) and is still unpaid.
 *     These are the ones that can be overdue, and the ones to act on.
 *   - `planned`: a template's next occurrence that has not been generated yet
 *     (next month or later), shown so an upcoming big bill is not a surprise.
 *
 * Pure: the application layer supplies the rows, this only shapes and totals
 * them. Day arithmetic is Istanbul calendar days (YYYY-MM-DD strings).
 */
import { addDaysToYmd, endOfMonthYmd, ymdDayDiff } from "@/shared/utils/date";

import type { ManualPaymentMethod } from "@/features/finance/domain/expense";

/** How far ahead an ungenerated occurrence is still worth listing. */
export const PLANNED_LOOKAHEAD_DAYS = 30;

export type RecurringExpenseDueKind = "pending" | "planned";
/** overdue: past its day · today · soon: within a week · later: beyond that. */
export type RecurringExpenseUrgency = "overdue" | "today" | "soon" | "later";

export interface PendingRecurringExpenseInput {
  readonly expenseId: string;
  readonly templateId: string;
  readonly dueDate: string; // YYYY-MM-DD
  readonly amountMinor: number;
  readonly paymentMethod: ManualPaymentMethod | null;
  readonly vendor: string | null;
}

export interface PlannedTemplateInput {
  readonly templateId: string;
  readonly name: string;
  readonly categoryLabel: string;
  readonly vendor: string | null;
  readonly amountMinor: number;
  readonly isEstimate: boolean;
  readonly paymentMethod: ManualPaymentMethod | null;
  readonly nextDueDate: string; // YYYY-MM-DD
  readonly endDate: string | null;
}

/** What the template contributes to a pending expense row it generated. */
export interface TemplateInfo {
  readonly name: string;
  readonly categoryLabel: string;
  readonly isEstimate: boolean;
}

export interface RecurringExpenseDueItem {
  readonly key: string;
  readonly kind: RecurringExpenseDueKind;
  readonly templateId: string;
  readonly name: string;
  readonly categoryLabel: string;
  readonly vendor: string | null;
  readonly amountMinor: number;
  /** `~` in the UI: a variable amount is an estimate, not a firm figure. */
  readonly isEstimate: boolean;
  readonly paymentMethod: ManualPaymentMethod | null;
  readonly dueDate: string;
  /** Negative = days overdue, 0 = today, positive = days left. */
  readonly daysUntil: number;
  readonly urgency: RecurringExpenseUrgency;
}

export interface RecurringExpenseOverview {
  readonly items: ReadonlyArray<RecurringExpenseDueItem>;
  readonly overdue: { readonly count: number; readonly totalMinor: number };
  /** Unpaid, due from today through the end of this month. */
  readonly restOfMonth: { readonly count: number; readonly totalMinor: number };
  /** Generated-but-unpaid, all of it: overdue + rest of month + anything later. */
  readonly pendingTotalMinor: number;
}

export function urgencyFor(daysUntil: number): RecurringExpenseUrgency {
  if (daysUntil < 0) return "overdue";
  if (daysUntil === 0) return "today";
  return daysUntil <= 7 ? "soon" : "later";
}

interface BuildInput {
  readonly today: string;
  readonly templates: ReadonlyMap<string, TemplateInfo>;
  readonly pending: ReadonlyArray<PendingRecurringExpenseInput>;
  readonly planned: ReadonlyArray<PlannedTemplateInput>;
}

export function buildRecurringExpenseOverview(input: BuildInput): RecurringExpenseOverview {
  const { today, templates } = input;
  const monthEnd = endOfMonthYmd(today);
  const horizon = addDaysToYmd(today, PLANNED_LOOKAHEAD_DAYS);

  const items: RecurringExpenseDueItem[] = [];

  for (const p of input.pending) {
    const tpl = templates.get(p.templateId);
    const daysUntil = ymdDayDiff(today, p.dueDate);
    items.push({
      key: `pending:${p.expenseId}`,
      kind: "pending",
      templateId: p.templateId,
      name: tpl?.name ?? "Rutin gider",
      categoryLabel: tpl?.categoryLabel ?? "—",
      vendor: p.vendor,
      amountMinor: p.amountMinor,
      isEstimate: tpl?.isEstimate ?? false,
      paymentMethod: p.paymentMethod,
      dueDate: p.dueDate,
      daysUntil,
      urgency: urgencyFor(daysUntil),
    });
  }

  for (const t of input.planned) {
    // Beyond its Bitiş Tarihi it will never be generated, so don't list it.
    if (t.endDate !== null && t.nextDueDate > t.endDate) continue;
    // Not yet generated: only what is on the horizon. Normally that means next
    // month or later (this month's occurrences are already `pending` rows), but
    // an occurrence the materializer failed to write is still shown here rather
    // than silently missing from the list.
    if (t.nextDueDate > horizon) continue;
    const daysUntil = ymdDayDiff(today, t.nextDueDate);
    items.push({
      key: `planned:${t.templateId}:${t.nextDueDate}`,
      kind: "planned",
      templateId: t.templateId,
      name: t.name,
      categoryLabel: t.categoryLabel,
      vendor: t.vendor,
      amountMinor: t.amountMinor,
      isEstimate: t.isEstimate,
      paymentMethod: t.paymentMethod,
      dueDate: t.nextDueDate,
      daysUntil,
      urgency: urgencyFor(daysUntil),
    });
  }

  items.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name, "tr"));

  const pendingItems = items.filter((i) => i.kind === "pending");
  const sum = (list: ReadonlyArray<RecurringExpenseDueItem>) =>
    list.reduce((acc, i) => acc + i.amountMinor, 0);
  const overdue = pendingItems.filter((i) => i.urgency === "overdue");
  const restOfMonth = pendingItems.filter((i) => i.daysUntil >= 0 && i.dueDate <= monthEnd);

  return {
    items,
    overdue: { count: overdue.length, totalMinor: sum(overdue) },
    restOfMonth: { count: restOfMonth.length, totalMinor: sum(restOfMonth) },
    pendingTotalMinor: sum(pendingItems),
  };
}
