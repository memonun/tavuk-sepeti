/**
 * Fetches the distinct values currently in use across the customer table —
 * fuels the filter bar dropdowns so the admin only sees options that
 * actually appear in the data (no empty-result selections).
 *
 * Three parallel queries:
 *   - distinct primary-address cities
 *   - distinct customer tags
 *   - distinct legacy_segment values
 *
 * Account types are a fixed enum so we don't query them — the UI hard-
 * codes the four values + their TR labels.
 *
 * Best-effort: any error falls back to an empty list so the page still
 * renders. The query layer's filters still work; the dropdown just won't
 * have suggestions.
 */
import "server-only";

import { logger } from "@/shared/logger";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export interface CustomerFilterOptions {
  readonly cities: readonly string[];
  readonly tags: readonly string[];
  readonly legacySegments: readonly string[];
}

function uniqueNonEmpty(values: ReadonlyArray<string | null>): string[] {
  const seen = new Set<string>();
  for (const v of values) {
    const t = (v ?? "").trim();
    if (t) seen.add(t);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "tr"));
}

export async function getCustomerFilterOptions(): Promise<CustomerFilterOptions> {
  const supabase = await createSupabaseServerClient();

  const [citiesResult, tagsResult, segmentsResult] = await Promise.all([
    supabase
      .from("addresses")
      .select("city")
      .eq("is_primary", true)
      .not("city", "is", null),
    supabase
      .from("customers")
      .select("tag")
      .not("tag", "is", null),
    supabase
      .from("customers")
      .select("legacy_segment")
      .not("legacy_segment", "is", null),
  ]);

  if (citiesResult.error)
    logger.warn({ code: citiesResult.error.code }, "filter_cities_failed");
  if (tagsResult.error)
    logger.warn({ code: tagsResult.error.code }, "filter_tags_failed");
  if (segmentsResult.error)
    logger.warn({ code: segmentsResult.error.code }, "filter_segments_failed");

  return {
    cities: uniqueNonEmpty((citiesResult.data ?? []).map((r) => r.city)),
    tags: uniqueNonEmpty((tagsResult.data ?? []).map((r) => r.tag)),
    legacySegments: uniqueNonEmpty(
      (segmentsResult.data ?? []).map((r) => r.legacy_segment),
    ),
  };
}
