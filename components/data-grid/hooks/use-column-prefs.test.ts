/**
 * use-column-prefs unit tests — focused on the pure mergePrefs helper.
 *
 * The hook itself wraps useState/useEffect/localStorage, which would
 * require a DOM environment to test fully. mergePrefs holds the actual
 * shape-handling logic that's worth testing in isolation; the React
 * lifecycle around it is exercised by manual smoke tests in the demo
 * route.
 */
import { describe, expect, it } from "vitest";

import { mergePrefs } from "@/components/data-grid/hooks/use-column-prefs";
import { EMPTY_COLUMN_PREFS } from "@/components/data-grid/data-grid-types";

describe("mergePrefs", () => {
  it("returns the base when override is empty", () => {
    const merged = mergePrefs(EMPTY_COLUMN_PREFS, {});
    expect(merged).toEqual(EMPTY_COLUMN_PREFS);
  });

  it("merges sizes additively (override wins on collision)", () => {
    const base = {
      ...EMPTY_COLUMN_PREFS,
      sizes: { name: 100, status: 80 },
    };
    const merged = mergePrefs(base, { sizes: { status: 120, city: 90 } });
    expect(merged.sizes).toEqual({ name: 100, status: 120, city: 90 });
  });

  it("replaces order when override supplies it", () => {
    const base = { ...EMPTY_COLUMN_PREFS, order: ["a", "b", "c"] };
    const merged = mergePrefs(base, { order: ["c", "a", "b"] });
    expect(merged.order).toEqual(["c", "a", "b"]);
  });

  it("keeps base order when override omits it", () => {
    const base = { ...EMPTY_COLUMN_PREFS, order: ["a", "b"] };
    const merged = mergePrefs(base, { hidden: ["a"] });
    expect(merged.order).toEqual(["a", "b"]);
    expect(merged.hidden).toEqual(["a"]);
  });

  it("replaces pinning halves independently", () => {
    const base = {
      ...EMPTY_COLUMN_PREFS,
      pinning: { left: ["name"], right: ["actions"] },
    };
    const merged = mergePrefs(base, { pinning: { left: ["id", "name"], right: [] } });
    expect(merged.pinning).toEqual({ left: ["id", "name"], right: [] });
  });

  it("always carries version=1 on the result", () => {
    const merged = mergePrefs(EMPTY_COLUMN_PREFS, {
      sizes: { x: 1 },
    });
    expect(merged.version).toBe(1);
  });
});
