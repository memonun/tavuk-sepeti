/**
 * application/ re-export of the domain's next-run math. Cross-feature imports
 * may only reach another feature's application/ (ESLint boundaries,
 * eslint.config.mjs), not its domain/ — this is the "public API" seam other
 * features use to reuse this date math without duplicating it, mirroring
 * features/products/application/list-products.ts's re-export of domain types.
 */
export { firstRunOnOrAfter } from "@/features/recurring/domain/compute-next-run";
