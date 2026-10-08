import { describe, expect, it } from "vitest";

import { runPreflight } from "./preflight.mjs";
import { findRlsGaps } from "./audit.mjs";

function fakeClient({ failOn = null } = {}) {
  const log = [];
  return {
    log,
    async query(sql) {
      log.push(sql.trim().split("\n")[0]);
      if (failOn && sql.includes(failOn)) {
        const e = new Error('relation "x" already exists');
        e.position = "42";
        throw e;
      }
      return { rows: [] };
    },
  };
}

const read = (f) => `-- ${f}\ncreate table ${f.replace(/\W/g, "_")} (id int);`;

describe("runPreflight", () => {
  it("runs every pending file in order inside one transaction and ALWAYS rolls back", async () => {
    const c = fakeClient();
    const r = await runPreflight(c, ["a.sql", "b.sql"], read);
    expect(r).toEqual({ ok: true, ran: ["a.sql", "b.sql"] });
    expect(c.log[0]).toBe("begin");
    expect(c.log.at(-1)).toBe("rollback");
    expect(c.log.filter((l) => l === "commit")).toHaveLength(0);
    expect(c.log).toContain("set local lock_timeout = '5s'");
  });

  it("stops at the first failing file, reports it, and still rolls back", async () => {
    const c = fakeClient({ failOn: "b_sql" });
    const r = await runPreflight(c, ["a.sql", "b.sql", "c.sql"], read);
    expect(r).toMatchObject({ ok: false, file: "b.sql", position: "42" });
    expect(r.message).toContain("already exists");
    expect(c.log.at(-1)).toBe("rollback");
    expect(c.log.some((l) => l.includes("c_sql"))).toBe(false);
  });
});

describe("findRlsGaps", () => {
  it("returns the names of tables without RLS", async () => {
    const client = { query: async () => ({ rows: [{ table_name: "leaky" }, { table_name: "also_leaky" }] }) };
    expect(await findRlsGaps(client)).toEqual(["leaky", "also_leaky"]);
  });
});
