/**
 * Tests for the type-aware filter applicator: each operator must translate to
 * the correct PostgREST builder call(s). Uses a recording mock builder so we
 * assert the exact (method, column, value) calls without a live DB.
 */
import { describe, expect, it } from "vitest";

import { addDaysToYmd, todayInIstanbul } from "@/shared/utils/date";
import { applyFilterRule, type FilterableBuilder } from "@/shared/filter/apply-filter-rules";
import type { FilterRule } from "@/shared/filter/filter-rule";

type Call = [string, ...unknown[]];

class MockBuilder implements FilterableBuilder<MockBuilder> {
  calls: Call[] = [];
  private push(m: string, ...a: unknown[]) {
    this.calls.push([m, ...a]);
    return this;
  }
  ilike(c: string, p: string) { return this.push("ilike", c, p); }
  eq(c: string, v: unknown) { return this.push("eq", c, v); }
  neq(c: string, v: unknown) { return this.push("neq", c, v); }
  gt(c: string, v: unknown) { return this.push("gt", c, v); }
  gte(c: string, v: unknown) { return this.push("gte", c, v); }
  lt(c: string, v: unknown) { return this.push("lt", c, v); }
  lte(c: string, v: unknown) { return this.push("lte", c, v); }
  or(f: string) { return this.push("or", f); }
  not(c: string, op: string, v: unknown) { return this.push("not", c, op, v); }
}

const rule = (over: Partial<FilterRule>): FilterRule => ({
  id: "r1",
  column: "col",
  operator: "contains",
  value: "",
  value2: "",
  ...over,
});

function apply(over: Partial<FilterRule>): Call[] {
  const b = new MockBuilder();
  applyFilterRule(b, rule(over));
  return b.calls;
}

describe("applyFilterRule — text", () => {
  it("contains → escaped ilike %x%", () => {
    expect(apply({ operator: "contains", value: "a%b" })).toEqual([
      ["ilike", "col", "%a\\%b%"],
    ]);
  });
  it("starts_with / ends_with", () => {
    expect(apply({ operator: "starts_with", value: "ali" })).toEqual([["ilike", "col", "ali%"]]);
    expect(apply({ operator: "ends_with", value: "ali" })).toEqual([["ilike", "col", "%ali"]]);
  });
  it("equals / not_equals", () => {
    expect(apply({ operator: "equals", value: "x" })).toEqual([["eq", "col", "x"]]);
    expect(apply({ operator: "not_equals", value: "x" })).toEqual([["neq", "col", "x"]]);
  });
  it("skips value-bearing operators with empty value", () => {
    expect(apply({ operator: "contains", value: "" })).toEqual([]);
    expect(apply({ operator: "gt", value: "" })).toEqual([]);
  });
});

describe("applyFilterRule — number", () => {
  it("gt/gte/lt/lte map straight through", () => {
    expect(apply({ operator: "gt", value: "5" })).toEqual([["gt", "col", "5"]]);
    expect(apply({ operator: "gte", value: "5" })).toEqual([["gte", "col", "5"]]);
    expect(apply({ operator: "lt", value: "5" })).toEqual([["lt", "col", "5"]]);
    expect(apply({ operator: "lte", value: "5" })).toEqual([["lte", "col", "5"]]);
  });
});

describe("applyFilterRule — date (day-aware, half-open)", () => {
  it("before → lt date", () => {
    expect(apply({ operator: "before", value: "2026-06-10" })).toEqual([["lt", "col", "2026-06-10"]]);
  });
  it("on_or_after → gte date", () => {
    expect(apply({ operator: "on_or_after", value: "2026-06-10" })).toEqual([["gte", "col", "2026-06-10"]]);
  });
  it("after → gte (date + 1 day)", () => {
    expect(apply({ operator: "after", value: "2026-06-10" })).toEqual([["gte", "col", "2026-06-11"]]);
  });
  it("on_or_before → lt (date + 1 day)", () => {
    expect(apply({ operator: "on_or_before", value: "2026-06-10" })).toEqual([["lt", "col", "2026-06-11"]]);
  });
  it("between → gte v, lt v2+1", () => {
    expect(apply({ operator: "between", value: "2026-06-01", value2: "2026-06-10" })).toEqual([
      ["gte", "col", "2026-06-01"],
      ["lt", "col", "2026-06-11"],
    ]);
  });
  it("ignores malformed dates", () => {
    expect(apply({ operator: "before", value: "nope" })).toEqual([]);
    expect(apply({ operator: "between", value: "2026-06-01", value2: "" })).toEqual([]);
  });
});

describe("applyFilterRule — relative dates", () => {
  it("is_today → today gte, tomorrow lt", () => {
    const today = todayInIstanbul();
    expect(apply({ operator: "is_today" })).toEqual([
      ["gte", "col", today],
      ["lt", "col", addDaysToYmd(today, 1)],
    ]);
  });
  it("is_past → lt today (single bound)", () => {
    expect(apply({ operator: "is_past" })).toEqual([["lt", "col", todayInIstanbul()]]);
  });
});

describe("applyFilterRule — presence", () => {
  it("is_empty → or(null,'')", () => {
    expect(apply({ operator: "is_empty" })).toEqual([["or", "col.is.null,col.eq."]]);
  });
  it("is_not_empty → not null + neq ''", () => {
    expect(apply({ operator: "is_not_empty" })).toEqual([
      ["not", "col", "is", null],
      ["neq", "col", ""],
    ]);
  });
});
