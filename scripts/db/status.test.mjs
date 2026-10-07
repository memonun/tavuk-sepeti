import { describe, expect, it } from "vitest";

import { computeStatus } from "./status.mjs";

describe("computeStatus", () => {
  const localFiles = ["20260101000000_a.sql", "20260102000000_b.sql", "20260103000000_c.sql"];

  it("is clean when every file is recorded", () => {
    const s = computeStatus({ localFiles, appliedVersions: ["20260101000000", "20260102000000", "20260103000000"] });
    expect(s).toEqual({ total: 3, pending: [], orphans: [], duplicates: [] });
  });

  it("lists pending files in version order", () => {
    const s = computeStatus({ localFiles: [...localFiles].reverse(), appliedVersions: ["20260101000000"] });
    expect(s.pending).toEqual(["20260102000000_b.sql", "20260103000000_c.sql"]);
  });

  it("reports versions recorded in the database but missing from the repo (drift)", () => {
    const s = computeStatus({ localFiles, appliedVersions: ["20260101000000", "20260102000000", "20260103000000", "20269999000000"] });
    expect(s.orphans).toEqual(["20269999000000"]);
  });

  it("reports duplicate versions — only one of them would ever run", () => {
    const s = computeStatus({
      localFiles: [...localFiles, "20260102000000_dup.sql"],
      appliedVersions: ["20260102000000"],
    });
    expect(s.duplicates).toEqual([["20260102000000_b.sql", "20260102000000_dup.sql"]]);
  });
});
