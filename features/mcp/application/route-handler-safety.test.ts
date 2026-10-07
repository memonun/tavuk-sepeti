/**
 * The connector runs the panel's application functions from a Route Handler
 * (/api/mcp). Some Next APIs only work inside a Server Action and THROW
 * elsewhere — `updateTag` and `refresh` — so an action using them directly would
 * write its data and then fail (and a retry would duplicate the write).
 *
 * Application code must use `invalidateCacheTag` (shared/cache) instead. This
 * guard fails the build the moment someone reintroduces a direct import.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..");
const FEATURES = join(ROOT, "features");

function applicationFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...applicationFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) && full.includes(`${join("", "application")}`)) {
      out.push(full);
    }
  }
  return out;
}

describe("Server-Action-only Next APIs in application code", () => {
  const files = applicationFiles(FEATURES).filter((f) => /[\\/]application[\\/]/.test(f));

  it("scans a meaningful number of files", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("never imports updateTag or refresh from next/cache", () => {
    const offenders = files.filter((file) => {
      const src = readFileSync(file, "utf8");
      const importsFromNextCache = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']next\/cache["']/g)];
      return importsFromNextCache.some((m) => /\b(updateTag|refresh)\b/.test(m[1] ?? ""));
    });
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });
});
