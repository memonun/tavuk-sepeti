/**
 * Guards the split between the two Tailwind entries:
 *   app/(shop)/shop.css — storefront only, scans an explicit `@source` list
 *   app/globals.css     — everything else, scans the whole repo
 *
 * The failure this catches is silent: a shop file that is not covered by an
 * `@source` line gets no CSS for any class only it uses, and nothing errors —
 * the page just renders unstyled in production. So instead of trusting the
 * list, walk the shop's real import graph and require every reachable file to
 * be covered.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const SHOP_DIR = path.join(ROOT, "app/(shop)");
const SHOP_CSS = path.join(SHOP_DIR, "shop.css");
const GLOBALS_CSS = path.join(ROOT, "app/globals.css");

/** Reachable from the shop, but deliberately not scanned — with the reason. */
const NOT_SCANNED: Record<string, string> = {
  // The root layout mounts only <TooltipProvider>, which renders no markup.
  // The shop shows no tooltip; the admin panel's come from app/globals.css.
  "components/ui/tooltip.tsx": "root layout uses TooltipProvider only",
};

const CODE = /\.(tsx?|m?js)$/;
const rel = (abs: string) => path.relative(ROOT, abs).split(path.sep).join("/");

function walkDir(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const abs = path.join(dir, name);
    return statSync(abs).isDirectory() ? walkDir(abs) : [abs];
  });
}

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null; // a package
  for (const ext of ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"]) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`${rel(from)}: cannot resolve "${spec}"`);
}

/** Value imports only: `import type` brings no markup into the bundle. */
function importsOf(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const specs: string[] = [];
  const re =
    /(?:^|[\s;])(?:import|export)(?!\s+type\s)\s[^'"`;]*?\sfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|(?:^|[\s;])import\s+["']([^"']+)["']/g;
  for (const m of src.matchAll(re)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec) specs.push(spec);
  }
  return specs;
}

function reachableFrom(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!CODE.test(file)) continue;
    for (const spec of importsOf(file)) {
      const target = resolveImport(file, spec);
      if (target) stack.push(target);
    }
  }
  return seen;
}

/** `@source "…"` paths of shop.css, as repo-relative patterns (`*` = one segment). */
function shopSources(): RegExp[] {
  const css = readFileSync(SHOP_CSS, "utf8");
  return [...css.matchAll(/^@source\s+"([^"]+)";/gm)].map(([, p]) => {
    const pattern = rel(path.resolve(SHOP_DIR, p!));
    const escaped = pattern
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join("[^/]+");
    // A file pattern matches itself; a folder pattern everything inside it.
    return new RegExp(`^${escaped}(?:/.*)?$`);
  });
}

function cssImportsOf(file: string): string[] {
  return importsOf(file)
    .filter((spec) => spec.endsWith(".css"))
    .map((spec) => rel(resolveImport(file, spec)!));
}

function firstLayerStatement(file: string): string | undefined {
  const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  return /@layer\s+([^;{]+);/.exec(css)?.[1]?.replace(/\s+/g, " ").trim();
}

describe("shop.css @source coverage", () => {
  it("scans every file the storefront can render", () => {
    const entries = [
      ...walkDir(SHOP_DIR).filter((f) => CODE.test(f) && !f.includes(".test.")),
      path.join(ROOT, "app/not-found.tsx"),
      path.join(ROOT, "app/layout.tsx"),
    ];
    const sources = shopSources();
    const uncovered = [...reachableFrom(entries)]
      .filter((f) => CODE.test(f))
      .map(rel)
      .filter((f) => !(f in NOT_SCANNED) && !sources.some((re) => re.test(f)));

    expect(uncovered, "add these to the @source list in app/(shop)/shop.css").toEqual([]);
  });

  it("does not scan the admin panel", () => {
    const sources = shopSources();
    for (const f of ["app/(admin)/layout.tsx", "components/ui/sidebar.tsx", "features/orders/ui/x.tsx"]) {
      expect(sources.some((re) => re.test(f)), f).toBe(false);
    }
  });
});

describe("every page gets exactly one Tailwind entry", () => {
  const ENTRIES = ["app/(shop)/shop.css", "app/globals.css"];

  it("the root layout imports no stylesheet (it would block the shop's first paint)", () => {
    expect(cssImportsOf(path.join(ROOT, "app/layout.tsx"))).toEqual([]);
  });

  it("each page, or a layout above it, imports one entry", () => {
    const pages = walkDir(path.join(ROOT, "app")).filter(
      (f) => /\/(page|not-found)\.tsx$/.test(f) && !rel(f).startsWith("app/api/"),
    );
    const missing: string[] = [];
    for (const page of pages) {
      const chain = [page];
      for (let dir = path.dirname(page); dir !== path.join(ROOT, "app"); dir = path.dirname(dir)) {
        const layout = path.join(dir, "layout.tsx");
        if (existsSync(layout)) chain.push(layout);
      }
      const found = chain.flatMap(cssImportsOf).filter((css) => ENTRIES.includes(css));
      if (new Set(found).size !== 1) missing.push(`${rel(page)} → ${found.join(", ") || "none"}`);
    }
    expect(missing).toEqual([]);
  });
});

describe("cascade layer order", () => {
  // When a client-side hop puts both sheets on one page, the full sheet must
  // win: that only holds if both declare the same order up front, with the
  // shop's utilities ranked below the full sheet's.
  it("both entries declare the same order, shop-utilities below utilities", () => {
    const shop = firstLayerStatement(SHOP_CSS);
    expect(shop).toBe("properties, theme, base, components, shop-utilities, utilities");
    expect(firstLayerStatement(GLOBALS_CSS)).toBe(shop);
  });
});
