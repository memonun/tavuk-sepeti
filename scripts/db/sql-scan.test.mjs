import { describe, expect, it } from "vitest";

import { mask, splitStatements, tableKey } from "./sql-scan.mjs";

describe("mask", () => {
  it("blanks comments and strings but keeps every character position", () => {
    const sql = "select 1; -- drop table x\n/* drop table y */ select 'drop table z';";
    const { masked } = mask(sql);
    expect(masked).toHaveLength(sql.length);
    expect(masked).not.toMatch(/drop table/);
    expect(masked.split("\n")).toHaveLength(2);
  });

  it("handles '' escapes inside strings", () => {
    const { masked } = mask("select 'it''s; fine'; select 2;");
    expect(splitStatements(masked)).toHaveLength(2);
  });

  it("masks dollar-quoted bodies (function bodies must not look like top-level SQL)", () => {
    const sql = "create function f() returns void as $$ begin delete from orders; end; $$ language plpgsql; select 1;";
    const { masked, bodies } = mask(sql);
    expect(masked).not.toMatch(/delete from orders/);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].text).toContain("delete from orders");
    expect(splitStatements(masked)).toHaveLength(2);
  });

  it("supports tagged dollar quotes and nested block comments", () => {
    const { masked } = mask("do $fn$ begin drop table a; end $fn$; /* a /* nested */ drop table b */ select 1;");
    expect(masked).not.toMatch(/drop table/);
  });
});

describe("splitStatements", () => {
  it("does not split on semicolons inside parentheses and reports start lines", () => {
    const sts = splitStatements("select 1;\n\ncreate table t (a int);\nselect 3;");
    expect(sts.map((s) => s.line)).toEqual([1, 3, 4]);
    expect(sts[1].norm).toBe("create table t (a int)");
  });
});

describe("tableKey", () => {
  it("normalises schema, quotes and case", () => {
    expect(tableKey('public."Foo"')).toBe("foo");
    expect(tableKey("PUBLIC.orders")).toBe("orders");
    expect(tableKey("auth.users")).toBe("auth.users");
  });
});
