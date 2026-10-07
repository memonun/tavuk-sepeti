import { describe, expect, it } from "vitest";

import { argSignature, dangersInStatement, lintMigration } from "./lint-rules.mjs";

const FILE = "20261015093000_test.sql";
const codes = (sql, level) =>
  lintMigration({ file: FILE, sql })
    .filter((f) => !level || f.level === level)
    .map((f) => f.code);

const COMPLIANT = `
create table notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table notes enable row level security;
create policy notes_admin_all on notes for all to authenticated using ((select is_admin())) with check ((select is_admin()));
grant select, insert, update, delete on table public.notes to authenticated;
`;

describe("a compliant new table", () => {
  it("raises nothing", () => {
    expect(lintMigration({ file: FILE, sql: COMPLIANT })).toEqual([]);
  });

  it("is also fine with schema-qualified names and IF NOT EXISTS", () => {
    const sql = `
      create table if not exists public.notes (id uuid primary key);
      alter table public.notes enable row level security;
      grant select on table public.notes to authenticated;`;
    expect(codes(sql)).toEqual([]);
  });
});

describe("errors (project rules)", () => {
  it("rejects a bad file name", () => {
    const f = lintMigration({ file: "yeni.sql", sql: "select 1;" });
    expect(f.map((x) => x.code)).toContain("bad-filename");
  });

  it("requires RLS and an explicit grant on every new table", () => {
    const c = codes("create table notes (id uuid primary key);", "error");
    expect(c).toEqual(expect.arrayContaining(["no-rls", "no-grant"]));
  });

  it("lets RLS-only tables opt out of the grant — but never out of RLS", () => {
    const withAllow = `-- db-lint: allow no-grant
      create table locked (id int);
      alter table locked enable row level security;`;
    expect(codes(withAllow, "error")).toEqual([]);
    expect(codes("-- db-lint: allow no-rls\ncreate table t (id int);", "error")).toContain("no-rls");
  });

  it("accepts a blanket grant on all tables in schema", () => {
    const sql = `create table a (id int); alter table a enable row level security;
      grant select on all tables in schema public to authenticated;`;
    expect(codes(sql, "error")).toEqual([]);
  });

  it("requires timestamptz", () => {
    expect(codes("create table t (at timestamp);alter table t enable row level security;grant select on table t to authenticated;", "error")).toContain("timestamp-without-tz");
    expect(codes("create table t (at timestamp without time zone);alter table t enable row level security;grant select on table t to authenticated;", "error")).toContain("timestamp-without-tz");
    expect(codes("create table t (at timestamptz default now());alter table t enable row level security;grant select on table t to authenticated;", "error")).not.toContain("timestamp-without-tz");
    expect(codes("create table t (at timestamp with time zone);alter table t enable row level security;grant select on table t to authenticated;", "error")).not.toContain("timestamp-without-tz");
  });

  it("requires an explicit ON DELETE on every foreign key", () => {
    const bad = "create table t (a uuid references customers(id), b int);alter table t enable row level security;grant select on table t to authenticated;";
    expect(codes(bad, "error")).toContain("fk-no-on-delete");
    const good = "alter table t add column a uuid references customers(id) on delete set null;";
    expect(codes(good, "error")).not.toContain("fk-no-on-delete");
  });

  it("rejects commands that cannot run in a transaction", () => {
    expect(codes("create index concurrently i on t (a);", "error")).toContain("non-transactional");
    expect(codes("vacuum analyze t;", "error")).toContain("non-transactional");
  });
});

describe("danger (needs a human)", () => {
  const d = (sql) => codes(sql, "danger");

  it.each([
    ["drop table old;", "drop-table"],
    ["alter table t drop column c;", "drop-column"],
    ["truncate t;", "truncate"],
    ["delete from t;", "delete-all"],
    ["update t set a = 1;", "update-all"],
    ["alter table t alter column c type text;", "alter-type"],
    ["alter table t alter column c set data type bigint;", "alter-type"],
    ["alter table t alter column c set not null;", "set-not-null"],
    ["alter table t rename to u;", "rename"],
    ["alter table t rename column a to b;", "rename"],
    ["revoke select on table t from authenticated;", "revoke"],
    ["alter table t disable row level security;", "disable-rls"],
    ["drop schema s cascade;", "drop-schema"],
    ["drop type mood;", "drop-type"],
    ["drop view v;", "drop-view"],
  ])("flags %s", (sql, code) => {
    expect(d(sql)).toContain(code);
  });

  it("flags a required column that has no default", () => {
    expect(d("alter table t add column c text not null;")).toContain("add-required-column");
    expect(d("alter table t add column c text not null default '';")).not.toContain("add-required-column");
    expect(d("alter table t add column c text;")).not.toContain("add-required-column");
  });

  it("does NOT flag scoped data changes", () => {
    expect(d("delete from t where a = 1;")).toEqual([]);
    expect(d("update t set a = 1 where b is null;")).toEqual([]);
  });

  it("does not flag tightening a function's grants, but does flag taking table access away", () => {
    expect(d("revoke execute on function f(uuid) from public, anon;")).toEqual([]);
    expect(d("revoke all on table t from authenticated;")).toContain("revoke");
  });

  it("ignores everything inside comments and strings", () => {
    expect(d("-- drop table old;\nselect 'drop table old';")).toEqual([]);
    expect(d("/* truncate t; */ select 1;")).toEqual([]);
  });

  it("sees dangers hidden in a DO block", () => {
    expect(d("do $$ begin drop table old; end $$;")).toContain("drop-table");
    expect(d("do $$ begin delete from t; end $$;")).toContain("delete-all");
  });

  it("does not treat a plain function body as top-level SQL", () => {
    const sql = "create or replace function f() returns void language plpgsql as $$ begin delete from t; end $$;";
    expect(d(sql)).toEqual([]);
  });
});

describe("function drops (the 2026-08-19 outage)", () => {
  const d = (sql) => codes(sql, "danger");

  it("drop + recreate with the SAME argument types is fine (old callers still work)", () => {
    const sql = `
      drop function if exists place_web_order(uuid, text);
      create function place_web_order(p_customer uuid, p_note text) returns uuid language sql as $$ select p_customer $$;`;
    expect(d(sql)).toEqual([]);
  });

  it("drop + recreate with a NEW required argument is the exact outage pattern", () => {
    const sql = `
      drop function if exists place_web_order(uuid, text);
      create function place_web_order(p_customer uuid, p_note text, p_legal jsonb) returns uuid language sql as $$ select p_customer $$;`;
    expect(d(sql)).toContain("drop-function");
  });

  it("a plain drop with no replacement is flagged", () => {
    expect(d("drop function old_thing(int);")).toContain("drop-function");
  });

  it("extending a function with a defaulted argument via create or replace is not a drop", () => {
    expect(d("create or replace function f(a uuid, b text default null) returns int language sql as $$ select 1 $$;")).toEqual([]);
  });

  it("argSignature compares types regardless of names and defaults", () => {
    expect(argSignature("p_a uuid, p_b text default null, double precision")).toEqual(["uuid", "text", "precision"]);
    expect(argSignature("uuid, text")).toEqual(["uuid", "text"]);
    expect(argSignature("")).toEqual([]);
  });
});

describe("warnings (never block)", () => {
  const w = (sql) => codes(sql, "warning");
  it("flags a money column stored as float, but not coordinates", () => {
    const base = "alter table t enable row level security; grant select on table t to authenticated;";
    expect(w(`create table t (total_price double precision); ${base}`)).toContain("float-column");
    expect(w(`create table t (lat double precision, lng double precision); ${base}`)).not.toContain("float-column");
  });
  it("flags security definer without search_path, and open policies", () => {
    expect(w("create function f() returns int language sql security definer as $$ select 1 $$;")).toContain("definer-no-search-path");
    expect(w("create policy p on t for select using (true);")).toContain("open-policy");
  });
  it("flags explicit begin/commit", () => {
    expect(w("begin; select 1; commit;")).toEqual(expect.arrayContaining(["explicit-transaction"]));
  });
});

describe("dangersInStatement", () => {
  it("can be used on a normalised single statement", () => {
    expect(dangersInStatement("drop table x")).toEqual(["drop-table"]);
  });
});
