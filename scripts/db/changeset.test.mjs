import { describe, expect, it } from "vitest";

import { checkChangeset } from "./changeset.mjs";

const existing = ["20260505190001_a.sql", "20261007140000_product_sales_stats.sql"];
const base = { added: [], modified: [], deleted: [], renamed: [], existing };
const codes = (c) => checkChangeset({ ...base, ...c }).map((f) => f.code);

describe("checkChangeset", () => {
  it("accepts a new migration that sorts after everything merged", () => {
    expect(codes({ added: ["20261015093000_new.sql"] })).toEqual([]);
  });

  it("rejects editing, deleting or renaming a published migration", () => {
    expect(codes({ modified: ["20260505190001_a.sql"] })).toEqual(["modified-existing"]);
    expect(codes({ deleted: ["20260505190001_a.sql"] })).toEqual(["deleted-existing"]);
    expect(codes({ renamed: [{ from: "20260505190001_a.sql", to: "20260505190001_b.sql" }] })).toEqual(["renamed-existing"]);
  });

  it("catches two files sharing one version (the 7 Ekim agenda/planner collision)", () => {
    const c = codes({ added: ["20261007140000_other.sql"] });
    expect(c).toContain("duplicate-version");
  });

  it("catches duplicate versions inside the same change", () => {
    expect(codes({ added: ["20261015093000_a.sql", "20261015093000_b.sql"] })).toContain("duplicate-version");
  });

  it("rejects a migration dated before the newest one on the base branch", () => {
    expect(codes({ added: ["20260601000000_old.sql"] })).toEqual(["version-not-newer"]);
  });

  it("flags nothing when only non-migration files changed", () => {
    expect(codes({})).toEqual([]);
  });
});
