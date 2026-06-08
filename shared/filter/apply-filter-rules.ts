/**
 * Shared Supabase filter-rule applicator.
 *
 * Applies a single FilterRule to a Supabase PostgREST filter builder and
 * returns it, so callers can chain or reassign in a loop.
 *
 * The LIKE-escape regex (`/[\\%_]/g`) is security-sensitive — it prevents
 * user-supplied wildcards from acting as SQL pattern wildcards. Do not
 * alter the regex or replacement without a matching test update.
 *
 * `FilterableBuilder<T>` is a minimal structural interface that covers only
 * the methods this function uses. The actual Supabase `PostgrestFilterBuilder`
 * satisfies it because all five methods have string-column overloads that
 * return `this` — which, when T is the concrete builder type, narrows to T.
 * No `any` is needed.
 */
import type { FilterRule } from "@/shared/filter/filter-rule";

/**
 * Minimal structural contract over the Supabase PostgREST filter builder.
 * Each method signature matches the concrete `string`-column overload on
 * `PostgrestFilterBuilder`, which returns `this` — compatible with `T`
 * when the caller passes the real builder.
 */
export interface FilterableBuilder<T> {
  ilike(column: string, pattern: string): T;
  eq(column: string, value: unknown): T;
  or(filters: string): T;
  not(column: string, operator: string, value: unknown): T;
  neq(column: string, value: unknown): T;
}

/**
 * Apply one FilterRule to a builder and return the updated builder.
 *
 * Rules with an empty value for value-bearing operators are silently skipped
 * (mirrors the per-repo behaviour: `if (rule.value === "") break`).
 *
 * The column whitelist check is the caller's responsibility — each repo's
 * loop guards with `if (!FILTERABLE_SET.has(rule.column)) continue` before
 * calling this function.
 */
export function applyFilterRule<T extends FilterableBuilder<T>>(
  builder: T,
  rule: FilterRule,
): T {
  const col = rule.column;

  switch (rule.operator) {
    case "contains": {
      if (rule.value === "") return builder;
      const pat = `%${rule.value.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      return builder.ilike(col, pat);
    }
    case "equals": {
      if (rule.value === "") return builder;
      return builder.eq(col, rule.value);
    }
    case "starts_with": {
      if (rule.value === "") return builder;
      const pat = `${rule.value.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      return builder.ilike(col, pat);
    }
    case "ends_with": {
      if (rule.value === "") return builder;
      const pat = `%${rule.value.replace(/[\\%_]/g, (m) => `\\${m}`)}`;
      return builder.ilike(col, pat);
    }
    case "is_empty": {
      // PostgREST OR-clause: NULL or empty-string both count as "empty".
      return builder.or(`${col}.is.null,${col}.eq.`);
    }
    case "is_not_empty": {
      return builder.not(col, "is", null).neq(col, "");
    }
  }
}
