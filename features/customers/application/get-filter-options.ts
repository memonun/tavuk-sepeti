/**
 * Returns the distinct values currently in use across the customer table —
 * fuels the filter bar dropdowns so the admin only sees options that
 * actually appear in the data (no empty-result selections).
 *
 * Implementation: a single RPC (`customer_filter_options`, migration 024)
 * computes cities + tags + legacy_segments server-side with DISTINCT +
 * ORDER BY, then hands back three small arrays. One round-trip, instead
 * of three SELECTs that returned every row.
 *
 * Caching: wrapped in Next 16's `unstable_cache` with a stable tag so the
 * dropdowns aren't recomputed on every list-page hit. Customer create /
 * update server actions call `revalidateTag(CUSTOMER_FILTER_TAG)` so a
 * new tag or city appears immediately in the dropdown.
 */
import "server-only";

import { unstable_cache } from "next/cache";

import { logger } from "@/shared/logger";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export interface CustomerFilterOptions {
  readonly cities: readonly string[];
  readonly tags: readonly string[];
  readonly legacySegments: readonly string[];
}

/** Tag used by customer write paths to invalidate the cached dropdowns. */
export const CUSTOMER_FILTER_TAG = "customer-filter-options";

async function fetchFilterOptions(): Promise<CustomerFilterOptions> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("customer_filter_options");
  if (error || !data) {
    logger.warn(
      { code: error?.code, message: error?.message },
      "filter_options_rpc_failed",
    );
    return { cities: [], tags: [], legacySegments: [] };
  }
  const row = data[0];
  return {
    cities: row?.cities ?? [],
    tags: row?.tags ?? [],
    legacySegments: row?.legacy_segments ?? [],
  };
}

/** Cached entry point — call this from page-level Server Components. */
export const getCustomerFilterOptions = unstable_cache(
  fetchFilterOptions,
  [CUSTOMER_FILTER_TAG],
  { tags: [CUSTOMER_FILTER_TAG] },
);
