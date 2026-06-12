/**
 * Tests for the shared filter rule parser + serializer. These exercise
 * the tamper paths that the page hits on every load (an admin can edit
 * the URL); the goal is to prove that nothing crashes and nothing
 * malicious slips past the schema.
 */
import { describe, expect, it } from "vitest";

import {
  filterRuleListSchema,
  parseFiltersFromQueryParam,
  serializeFiltersToQueryParam,
  type FilterRule,
} from "@/shared/filter/filter-rule";

const sampleRule = (over: Partial<FilterRule> = {}): FilterRule => ({
  id: "r1",
  column: "first_name",
  operator: "contains",
  value: "ali",
  value2: "",
  ...over,
});

describe("parseFiltersFromQueryParam", () => {
  it("returns [] for null / undefined / empty string", () => {
    expect(parseFiltersFromQueryParam(null)).toEqual([]);
    expect(parseFiltersFromQueryParam(undefined)).toEqual([]);
    expect(parseFiltersFromQueryParam("")).toEqual([]);
  });

  it("parses a valid one-rule list", () => {
    const json = JSON.stringify([sampleRule()]);
    const out = parseFiltersFromQueryParam(json);
    expect(out).toHaveLength(1);
    expect(out[0]?.column).toBe("first_name");
  });

  it("collapses to [] on malformed JSON", () => {
    expect(parseFiltersFromQueryParam("not json")).toEqual([]);
    expect(parseFiltersFromQueryParam("{")).toEqual([]);
  });

  it("collapses to [] when the shape doesn't match the schema", () => {
    expect(parseFiltersFromQueryParam('{"not":"an array"}')).toEqual([]);
    expect(
      parseFiltersFromQueryParam('[{"column":"x","operator":"contains"}]'),
    ).toEqual([]); // missing id
    expect(
      parseFiltersFromQueryParam(
        '[{"id":"r1","column":"x","operator":"BOGUS","value":"y"}]',
      ),
    ).toEqual([]); // unknown operator
  });

  it("rejects payloads above the 20-rule cap", () => {
    const tooMany = Array.from({ length: 21 }, (_, i) =>
      sampleRule({ id: `r${i}` }),
    );
    const out = parseFiltersFromQueryParam(JSON.stringify(tooMany));
    expect(out).toEqual([]);
  });

  it("survives oversized value strings (200 char schema cap)", () => {
    const huge = "x".repeat(201);
    const out = parseFiltersFromQueryParam(
      JSON.stringify([sampleRule({ value: huge })]),
    );
    expect(out).toEqual([]);
  });
});

describe("serializeFiltersToQueryParam", () => {
  it("returns null for an empty list", () => {
    expect(serializeFiltersToQueryParam([])).toBeNull();
  });

  it("emits compact JSON for a valid rule", () => {
    const out = serializeFiltersToQueryParam([sampleRule()]);
    expect(out).toContain('"column":"first_name"');
    expect(out).toContain('"operator":"contains"');
  });

  it("strips empty-value rules unless the operator is valueless", () => {
    const out = serializeFiltersToQueryParam([
      sampleRule({ id: "a", value: "" }),
      sampleRule({ id: "b", value: " " }), // whitespace also counts as noop
      sampleRule({ id: "c", value: "ali" }),
    ]);
    expect(out).not.toBeNull();
    const parsed = JSON.parse(out!) as FilterRule[];
    expect(parsed.map((r) => r.id)).toEqual(["c"]);
  });

  it("keeps is_empty / is_not_empty rules even with no value", () => {
    const out = serializeFiltersToQueryParam([
      sampleRule({ id: "a", operator: "is_empty", value: "" }),
      sampleRule({ id: "b", operator: "is_not_empty", value: "" }),
    ]);
    expect(out).not.toBeNull();
    const parsed = JSON.parse(out!) as FilterRule[];
    expect(parsed).toHaveLength(2);
  });

  it("returns null when every rule is a noop", () => {
    expect(
      serializeFiltersToQueryParam([
        sampleRule({ value: "" }),
        sampleRule({ id: "r2", value: "" }),
      ]),
    ).toBeNull();
  });
});

describe("round-trip", () => {
  it("parse(serialize(x)) preserves meaningful rules", () => {
    const input = [sampleRule(), sampleRule({ id: "r2", value: "yılmaz" })];
    const serialized = serializeFiltersToQueryParam(input);
    const back = parseFiltersFromQueryParam(serialized);
    expect(back).toHaveLength(2);
    expect(back[0]?.value).toBe("ali");
    expect(back[1]?.value).toBe("yılmaz");
  });
});

describe("filterRuleListSchema", () => {
  it("accepts the empty array as the no-filter baseline", () => {
    expect(filterRuleListSchema.parse([])).toEqual([]);
  });
});
