import { describe, expect, it } from "vitest";

import {
  parseExcludeDelivered,
  serializeExcludeDelivered,
} from "@/features/routing/domain/exclude-delivered-url";

describe("parseExcludeDelivered", () => {
  it("returns an empty list for undefined / empty input", () => {
    expect(parseExcludeDelivered(undefined)).toEqual([]);
    expect(parseExcludeDelivered(null)).toEqual([]);
    expect(parseExcludeDelivered("")).toEqual([]);
  });

  it("splits, trims, and drops blanks", () => {
    expect(parseExcludeDelivered("a, b ,,c")).toEqual(["a", "b", "c"]);
  });

  it("dedupes repeated ids", () => {
    expect(parseExcludeDelivered("a,a,b")).toEqual(["a", "b"]);
  });

  it("drops over-long tokens (defensive against hostile URLs)", () => {
    const long = "x".repeat(65);
    expect(parseExcludeDelivered(`ok,${long}`)).toEqual(["ok"]);
  });
});

describe("serializeExcludeDelivered", () => {
  it("joins ids with commas", () => {
    expect(serializeExcludeDelivered(["a", "b"])).toBe("a,b");
  });

  it("dedupes and yields empty string for no ids", () => {
    expect(serializeExcludeDelivered([])).toBe("");
    expect(serializeExcludeDelivered(["a", "a"])).toBe("a");
  });

  it("round-trips with parse", () => {
    const ids = ["o1", "o2", "o3"];
    expect(parseExcludeDelivered(serializeExcludeDelivered(ids))).toEqual(ids);
  });

  it("accepts a Set", () => {
    expect(serializeExcludeDelivered(new Set(["a", "b"]))).toBe("a,b");
  });
});
