import "server-only";

/**
 * The showcase photos for the home page and the admin "Vitrin" page.
 *
 * The home page read is cached under a tag the admin actions invalidate, the
 * same layering as get-storefront-settings.ts: at 1000 concurrent visitors
 * (CLAUDE.md §1) this would otherwise be a query per home page render.
 *
 * It never comes back empty: an unreadable table, or (should it ever happen)
 * a table with no rows, shows the launch photos rather than an empty frame.
 * The repository already logged why.
 */
import { unstable_cache } from "next/cache";
import { cache } from "react";

import {
  DEFAULT_SHOWCASE_SLIDES,
  type ShowcaseSlide,
} from "@/features/storefront/domain/showcase";
import {
  fetchShowcaseSlides,
  fetchShowcaseSlidesAsAdmin,
} from "@/features/storefront/infrastructure/showcase.repository";
import type { AppError } from "@/shared/errors/app-error";
import type { Result } from "@/shared/result";

export type { ShowcaseSlide };

/** Tag the admin actions invalidate. */
export const SHOWCASE_TAG = "showcase-slides";

/** Bump when `ShowcaseSlide` changes shape (the data cache outlives a deploy). */
const SHOWCASE_CACHE_VERSION = "v1";

async function loadSlides(): Promise<readonly ShowcaseSlide[]> {
  const read = await fetchShowcaseSlides();
  return read.ok && read.value.length > 0 ? read.value : DEFAULT_SHOWCASE_SLIDES;
}

export const getShowcaseSlides = cache(
  unstable_cache(loadSlides, [SHOWCASE_TAG, SHOWCASE_CACHE_VERSION], {
    tags: [SHOWCASE_TAG],
  }),
);

/**
 * The admin page read: uncached, and a failure is reported as one — the admin
 * must never be shown the fallback photos as if they were editable rows.
 */
export async function listShowcaseSlidesForAdmin(): Promise<Result<ShowcaseSlide[], AppError>> {
  return fetchShowcaseSlidesAsAdmin();
}
