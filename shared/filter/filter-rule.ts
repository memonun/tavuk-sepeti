/**
 * Filter rule types + Zod schemas. Pure, layer-free — UI primitives
 * (components/data-grid/filters) re-export this; feature domains
 * (customers, orders) compose `filterRuleListSchema` into their
 * own list-query schemas.
 *
 * Lives in shared/ because both domain and ui need the shape and
 * the ESLint boundaries plugin forbids domain → components.
 *
 * Faz 1: text operators only. Number/date/select-specific operators
 * land in Faz 2.
 */
import { z } from "zod";

export const filterOperatorSchema = z.enum([
  "contains",
  "equals",
  "starts_with",
  "ends_with",
  "is_empty",
  "is_not_empty",
]);
export type FilterOperator = z.output<typeof filterOperatorSchema>;

/** Display labels for the UI dropdown. */
export const FILTER_OPERATOR_LABELS: Readonly<Record<FilterOperator, string>> = {
  contains: "içerir",
  equals: "eşittir",
  starts_with: "ile başlar",
  ends_with: "ile biter",
  is_empty: "boş",
  is_not_empty: "dolu",
};

/** Operators that don't take a value (the UI hides the input). */
export const VALUELESS_OPERATORS: ReadonlySet<FilterOperator> = new Set([
  "is_empty",
  "is_not_empty",
]);

/** One rule = one (column, op, value) triple. */
export const filterRuleSchema = z.object({
  /** UI-stable id for keyed React lists; server doesn't care. */
  id: z.string().min(1),
  column: z.string().min(1),
  operator: filterOperatorSchema,
  value: z.string().max(200).default(""),
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
 *   ?filter=[{"id":"r1","column":"first_name","operator":"contains","value":"ali"}]
 * Tampered / corrupt payloads collapse to [] rather than crashing
 * the page.
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
 * Drop empty-value rules that aren't `is_empty` / `is_not_empty`
 * (those operators don't take a value). Keeps the URL clean and the
 * repo skips the same rules anyway — without this, reload restores
 * noise rules that don't filter but cost ~80 chars each in the URL.
 */
function stripNoopRules(rules: FilterRuleList): FilterRuleList {
  return rules.filter(
    (r) => VALUELESS_OPERATORS.has(r.operator) || r.value.trim() !== "",
  );
}

export function serializeFiltersToQueryParam(
  rules: FilterRuleList,
): string | null {
  const meaningful = stripNoopRules(rules);
  if (meaningful.length === 0) return null;
  return JSON.stringify(meaningful);
}
