/**
 * UI-facing re-export of the shared filter types. The actual schema /
 * (de)serializer lives in `shared/filter/filter-rule.ts` so the domain
 * layer can compose it without crossing the boundaries-plugin rule
 * (domain → components is forbidden).
 *
 * The `FilterableColumn` shape is UI-only (label is a presentation
 * concern) and stays here.
 */
export {
  FILTER_OPERATOR_LABELS,
  VALUELESS_OPERATORS,
  RANGE_OPERATORS,
  OPERATORS_BY_KIND,
  DEFAULT_OPERATOR_BY_KIND,
  filterOperatorSchema,
  filterRuleListSchema,
  filterRuleSchema,
  parseFiltersFromQueryParam,
  serializeFiltersToQueryParam,
  type FilterOperator,
  type FilterColumnKind,
  type FilterRule,
  type FilterRuleList,
} from "@/shared/filter/filter-rule";

import type { FilterColumnKind } from "@/shared/filter/filter-rule";

/** A choice for a `select`-kind filter column's value dropdown. */
export interface FilterOption {
  readonly value: string;
  readonly label: string;
}

/** Columns the filter builder offers in its column dropdown. The
 *  grid passes this list — feature code declares which fields are
 *  filterable, their type (drives the operators offered), and how they
 *  display. `kind` defaults to "text" when omitted. */
export interface FilterableColumn {
  readonly id: string;
  readonly label: string;
  readonly kind?: FilterColumnKind;
  /** Value choices for `kind: "select"` columns. */
  readonly options?: ReadonlyArray<FilterOption>;
}
