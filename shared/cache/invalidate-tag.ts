/**
 * Invalidate a cache tag from either a Server Action or a Route Handler.
 *
 * Next 16's `updateTag` (read-your-own-writes) THROWS outside a Server Action —
 * including in a Route Handler. The Claude connector runs the panel's Server
 * Action functions from `/api/mcp`, so an action that ends with `updateTag(...)`
 * would perform its write and then blow up, reporting failure for a change that
 * already happened (and inviting a retry that duplicates it).
 *
 * In a Server Action this behaves exactly like `updateTag`. Anywhere else it
 * falls back to `revalidateTag(tag, { expire: 0 })`: immediate expiry, the
 * closest equivalent a Route Handler is allowed to use.
 */
import { revalidateTag, updateTag } from "next/cache";

export function invalidateCacheTag(tag: string): void {
  try {
    updateTag(tag);
  } catch {
    revalidateTag(tag, { expire: 0 });
  }
}
