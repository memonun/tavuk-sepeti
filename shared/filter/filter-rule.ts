/**
 * Filter rule types + Zod schemas. Pure, layer-free — UI primitives
 * (components/data-grid/filters) re-export this; feature domains
 * (customers, orders) compose `filterRuleListSchema` into their
 * own list-query schemas.
 *
 * Lives in shared/ because both domain and ui need the shape and
 * the ESLint boundaries plugin forbids domain → components.
 *
 * Operators are TYPE-AWARE: a column's `kind` (text/number/date/select)
 * decides which operators it offers (OPERATORS_BY_KIND). The server applies
 * them in apply-filter-rules.ts; relative-date operators resolve to calendar
 * bounds in relative-date.ts.
 */
import { z } from "zod";

export const filterOperatorSchema = z.enum([
  // text
  "contains",
  "starts_with",
  "ends_with",
  // shared equality
  "equals",
  "not_equals",
  // number / date comparison
  "gt",
  "gte",
  "lt",
  "lte",
  "before",
  "after",
  "on_or_before",
  "on_or_after",
  "between",
  // relative date (valueless)
  "is_today",
  "is_this_week",
  "is_this_month",
  "is_past",
  "is_future",
  // presence
  "is_empty",
  "is_not_empty",
]);
export type FilterOperator = z.output<typeof filterOperatorSchema>;

/** Display labels for the UI dropdown. */
export const FILTER_OPERATOR_LABELS: Readonly<Record<FilterOperator, string>> = {
  contains: "içerir",
  starts_with: "ile başlar",
  ends_with: "ile biter",
  equals: "eşittir",
  not_equals: "eşit değil",
  gt: "büyüktür",
  gte: "büyük veya eşit",
  lt: "küçüktür",
  lte: "küçük veya eşit",
  before: "önce",
  after: "sonra",
  on_or_before: "ve öncesi",
  on_or_after: "ve sonrası",
  between: "arasında",
  is_today: "bugün",
  is_this_week: "bu hafta",
  is_this_month: "bu ay",
  is_past: "geçmiş",
  is_future: "gelecek",
  is_empty: "boş",
  is_not_empty: "dolu",
};

/** Operators that don't take a value (the UI hides the input). */
export const VALUELESS_OPERATORS: ReadonlySet<FilterOperator> = new Set([
  "is_empty",
  "is_not_empty",
  "is_today",
  "is_this_week",
  "is_this_month",
  "is_past",
  "is_future",
]);

/** Operators that take a second value (a range upper bound). */
export const RANGE_OPERATORS: ReadonlySet<FilterOperator> = new Set(["between"]);

/** Relative-date operators resolved to calendar bounds server-side. */
export const RELATIVE_DATE_OPERATORS: ReadonlySet<FilterOperator> = new Set([
  "is_today",
  "is_this_week",
  "is_this_month",
  "is_past",
  "is_future",
]);

/** Filter-facing column kind — derived from the grid column's `columnType`. */
export type FilterColumnKind = "text" | "number" | "date" | "select";

/** Operators offered per column kind, in display order. */
export const OPERATORS_BY_KIND: Readonly<
  Record<FilterColumnKind, ReadonlyArray<FilterOperator>>
> = {
  text: ["contains", "equals", "not_equals", "starts_with", "ends_with", "is_empty", "is_not_empty"],
  number: ["equals", "not_equals", "gt", "gte", "lt", "lte", "is_empty", "is_not_empty"],
  date: [
    "before",
    "after",
    "on_or_before",
    "on_or_after",
    "between",
    "is_today",
    "is_this_week",
    "is_this_month",
    "is_past",
    "is_future",
    "is_empty",
    "is_not_empty",
  ],
  select: ["equals", "not_equals", "is_empty", "is_not_empty"],
};

/** The operator a freshly-added rule starts on, per kind. */
export const DEFAULT_OPERATOR_BY_KIND: Readonly<Record<FilterColumnKind, FilterOperator>> = {
  text: "contains",
  number: "equals",
  date: "after",
  select: "equals",
};

/** One rule = one (column, op, value[, value2]) tuple. */
export const filterRuleSchema = z.object({
  /** UI-stable id for keyed React lists; server doesn't care. */
  id: z.string().min(1),
  column: z.string().min(1),
  operator: filterOperatorSchema,
  value: z.string().max(200).default(""),
  /** Upper bound for range operators (between). */
  value2: z.string().max(200).default(""),
});
export type FilterRule = z.output<typeof filterRuleSchema>;

/**
 * Whole filter payload. Capped at 20 rules so a tampered URL can't
 * push the repo's query builder into a clause explosion.
 */
export const filterRuleListSchema = z.array(filterRuleSchema).max(20);
export type FilterRuleList = z.output<typeof filterRuleListSchema>;

/**
 * Compact URL form: a JSON array as a single query-string value.
 *   ?filter=[{"id":"r1","column":"scheduled_for","operator":"is_this_week","value":""}]
 * Tampered / corrupt payloads collapse to [] rather than crashing the page.
 */
export function parseFiltersFromQueryParam(
  raw: string | null | undefined,
): FilterRuleList {
  if (!raw) return [];
  try {
    const decoded = JSON.parse(raw) as unknown;
    const parsed = filterRuleListSchema.safeParse(decoded);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/**
 * Drop rules that won't filter anything: value-bearing operators with a blank
 * value (or a range operator missing its upper bound). Valueless operators
 * (is_empty, relative dates) always survive. Keeps the URL clean and mirrors
 * the applicator's skip behaviour.
 */
function stripNoopRules(rules: FilterRuleList): FilterRuleList {
  return rules.filter((r) => {
    if (VALUELESS_OPERATORS.has(r.operator)) return true;
    if (r.value.trim() === "") return false;
    if (RANGE_OPERATORS.has(r.operator) && r.value2.trim() === "") return false;
    return true;
  });
}

export function serializeFiltersToQueryParam(
  rules: FilterRuleList,
): string | null {
  const meaningful = stripNoopRules(rules);
  if (meaningful.length === 0) return null;
  return JSON.stringify(meaningful);
}
