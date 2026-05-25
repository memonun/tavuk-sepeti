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
  filterOperatorSchema,
  filterRuleListSchema,
  filterRuleSchema,
  parseFiltersFromQueryParam,
  serializeFiltersToQueryParam,
  type FilterOperator,
  type FilterRule,
  type FilterRuleList,
} from "@/shared/filter/filter-rule";

/** Columns the filter builder offers in its column dropdown. The
 *  grid passes this list — feature code declares which fields are
 *  filterable + how they display. */
export interface FilterableColumn {
  readonly id: string;
  readonly label: string;
}
