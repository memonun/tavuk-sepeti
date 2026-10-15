import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ADMIN_ROUTE_PREFIXES, isAdminPath } from "./admin-route-prefixes";

describe("ADMIN_ROUTE_PREFIXES", () => {
  // Fails when a new admin section is added under app/(admin)/ without being
  // listed — that section would otherwise skip the proxy's /login redirect and
  // be left crawlable in robots.txt.
  it("lists exactly the routed folders under app/(admin)/", () => {
    const adminSegments = readdirSync(join(process.cwd(), "app", "(admin)"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
      .map((entry) => `/${entry.name}`)
      .sort();

    expect(adminSegments.length).toBeGreaterThan(5);
    expect([...ADMIN_ROUTE_PREFIXES].sort()).toEqual(adminSegments);
  });
});

describe("isAdminPath", () => {
  it("matches a prefix and anything below it", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/orders/123")).toBe(true);
    expect(isAdminPath("/magaza-ayarlari")).toBe(true);
  });

  it("does not match storefront paths or look-alike prefixes", () => {
    expect(isAdminPath("/")).toBe(false);
    expect(isAdminPath("/giris")).toBe(false);
    expect(isAdminPath("/ordersx")).toBe(false);
    expect(isAdminPath("/administrator")).toBe(false);
  });
});
