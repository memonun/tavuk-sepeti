import "server-only";

/**
 * The live storefront rules (delivery days + cargo order floor).
 *
 * Cached with a stable tag: the checkout page, the basket sheet and the
 * Server Action all need these values, and at 1000 concurrent users
 * (CLAUDE.md §1) that would otherwise be one single-row query per render. The
 * admin write calls `updateTag(STOREFRONT_SETTINGS_TAG)`, so a change the owner
 * makes is visible on the very next request rather than after a TTL.
 *
 * Failure degrades to the LAUNCH DEFAULTS, never to "no rules": an unreadable
 * settings row must not turn into a checkout with no delivery days and no order
 * floor. The repository already logged why.
 */
import { unstable_cache } from "next/cache";

import {
  DEFAULT_STOREFRONT_SETTINGS,
  type StorefrontSettings,
} from "@/features/storefront/domain/storefront-settings";
import { fetchStorefrontSettings } from "@/features/storefront/infrastructure/storefront-settings.repository";

export type { StorefrontSettings };

/** Tag the admin write invalidates. */
export const STOREFRONT_SETTINGS_TAG = "storefront-settings";

async function loadSettings(): Promise<StorefrontSettings> {
  const read = await fetchStorefrontSettings();
  return read.kind === "row" ? read.settings : DEFAULT_STOREFRONT_SETTINGS;
}

/** Cached entry point — call this from Server Components and Server Actions. */
export const getStorefrontSettings = unstable_cache(
  loadSettings,
  [STOREFRONT_SETTINGS_TAG],
  { tags: [STOREFRONT_SETTINGS_TAG] },
);
