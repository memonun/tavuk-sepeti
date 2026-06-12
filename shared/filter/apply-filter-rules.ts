/**
 * Shared Supabase filter-rule applicator. Applies one type-aware FilterRule to
 * a PostgREST filter builder and returns it (so callers chain in a loop).
 *
 * The operator itself carries the semantics, so the applicator needs no column
 * "kind":
 *   - contains/starts_with/ends_with → ilike (LIKE-escaped)
 *   - equals/not_equals             → eq/neq
 *   - gt/gte/lt/lte                 → numeric comparison
 *   - before/after/on_or_before/on_or_after/between → DAY-aware date bounds
 *     (value = YYYY-MM-DD; half-open [gte, lt) so it works for both `date` and
 *     `timestamptz` columns)
 *   - is_today/.../is_future        → resolved to [gte, lt) calendar bounds
 *   - is_empty/is_not_empty         → null/'' presence
 *
 * The LIKE-escape regex (`/[\\%_]/g`) is security-sensitive — it prevents
 * user-supplied wildcards from acting as SQL pattern wildcards. Do not alter
 * the regex or replacement without a matching test update.
 *
 * The column whitelist check is the caller's responsibility — each repo's loop
 * guards with `if (!FILTERABLE_SET.has(rule.column)) continue` first.
 */
import { addDaysToYmd } from "@/shared/utils/date";
import {
  RELATIVE_DATE_OPERATORS,
  type FilterRule,
} from "@/shared/filter/filter-rule";
import { resolveRelativeDateBounds } from "@/shared/filter/relative-date";

/**
 * Minimal structural contract over the Supabase PostgREST filter builder. Each
 * method matches the concrete `string`-column overload (returns `this`).
 */
export interface FilterableBuilder<T> {
  ilike(column: string, pattern: string): T;
  eq(column: string, value: unknown): T;
  neq(column: string, value: unknown): T;
  gt(column: string, value: unknown): T;
  gte(column: string, value: unknown): T;
  lt(column: string, value: unknown): T;
  lte(column: string, value: unknown): T;
  or(filters: string): T;
  not(column: string, operator: string, value: unknown): T;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export function applyFilterRule<T extends FilterableBuilder<T>>(
  builder: T,
  rule: FilterRule,
): T {
  const col = rule.column;
  const v = rule.value;
  const v2 = rule.value2;

  // Relative dates → [gte, lt) bounds, no value needed.
  if (RELATIVE_DATE_OPERATORS.has(rule.operator)) {
    const { gte, lt } = resolveRelativeDateBounds(rule.operator);
    let b = builder;
    if (gte) b = b.gte(col, gte);
    if (lt) b = b.lt(col, lt);
    return b;
  }

  switch (rule.operator) {
    case "contains":
      return v === "" ? builder : builder.ilike(col, `%${escapeLike(v)}%`);
    case "starts_with":
      return v === "" ? builder : builder.ilike(col, `${escapeLike(v)}%`);
    case "ends_with":
      return v === "" ? builder : builder.ilike(col, `%${escapeLike(v)}`);
    case "equals":
      return v === "" ? builder : builder.eq(col, v);
    case "not_equals":
      return v === "" ? builder : builder.neq(col, v);
    case "gt":
      return v === "" ? builder : builder.gt(col, v);
    case "gte":
      return v === "" ? builder : builder.gte(col, v);
    case "lt":
      return v === "" ? builder : builder.lt(col, v);
    case "lte":
      return v === "" ? builder : builder.lte(col, v);
    // Day-aware date comparisons (value = YYYY-MM-DD), half-open bounds.
    case "before":
      return YMD.test(v) ? builder.lt(col, v) : builder;
    case "on_or_after":
      return YMD.test(v) ? builder.gte(col, v) : builder;
    case "after":
      return YMD.test(v) ? builder.gte(col, addDaysToYmd(v, 1)) : builder;
    case "on_or_before":
      return YMD.test(v) ? builder.lt(col, addDaysToYmd(v, 1)) : builder;
    case "between":
      return YMD.test(v) && YMD.test(v2)
        ? builder.gte(col, v).lt(col, addDaysToYmd(v2, 1))
        : builder;
    case "is_empty":
      return builder.or(`${col}.is.null,${col}.eq.`);
    case "is_not_empty":
      return builder.not(col, "is", null).neq(col, "");
    default:
      return builder;
  }
}
