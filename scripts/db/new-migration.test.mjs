import { describe, expect, it } from "vitest";

import { lintMigration } from "./lint-rules.mjs";
import { nextVersion, slugify, template } from "./new-migration.mjs";

describe("nextVersion", () => {
  it("uses 'now' when it is later than every existing migration", () => {
    expect(nextVersion(["20260505190001"], new Date("2026-10-15T09:30:00Z"))).toBe("20261015093000");
  });

  it("goes one second past the newest existing migration when 'now' is not later (parallel branches)", () => {
    expect(nextVersion(["20261015093000"], new Date("2026-10-15T09:00:00Z"))).toBe("20261015093001");
  });

  it("rolls over minutes and days correctly", () => {
    expect(nextVersion(["20261015235959"], new Date("2026-01-01T00:00:00Z"))).toBe("20261016000000");
  });

  it("works with no existing migrations", () => {
    expect(nextVersion([], new Date("2026-10-15T09:30:00Z"))).toBe("20261015093000");
  });
});

describe("slugify", () => {
  it("makes safe lower_snake names, including Turkish letters", () => {
    expect(slugify("Müşteri Notları!")).toBe("musteri_notlari");
    expect(slugify("  ÇİĞDEM  ")).toBe("cigdem");
    expect(slugify("???")).toBe("");
  });
});

describe("template", () => {
  it("passes the linter's file-name rule and contains no live SQL to apply by accident", () => {
    const findings = lintMigration({ file: "20261015093000_x.sql", sql: template("x") });
    expect(findings.map((f) => f.code)).toEqual(["empty"]);
  });
});
