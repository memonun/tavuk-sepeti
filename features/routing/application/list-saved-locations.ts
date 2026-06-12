import "server-only";

/**
 * Application surface for saved start locations. UI imports from here (not the
 * repository) per the layering rules.
 */
import { listSavedLocations as repoList } from "@/features/routing/infrastructure/saved-location.repository";

export { type SavedLocation } from "@/features/routing/domain/saved-location";

export const listSavedLocations = repoList;
