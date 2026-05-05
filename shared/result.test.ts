import { describe, expect, it } from "vitest";

import {
  andThen,
  err,
  isErr,
  isOk,
  map,
  mapErr,
  match,
  ok,
  tryAsync,
  trySync,
  unwrap,
  unwrapOr,
} from "@/shared/result";

describe("Result", () => {
  it("ok() builds an Ok and isOk narrows", () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (isOk(r)) {
      expect(r.value).toBe(42);
    }
  });

  it("err() builds an Err and isErr narrows", () => {
    const r = err("nope");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error).toBe("nope");
    }
  });

  it("map transforms Ok and passes Err through", () => {
    expect(map(ok(2), (n) => n * 3)).toEqual(ok(6));
    const e = err("x");
    expect(map(e, (n: number) => n * 3)).toBe(e);
  });

  it("mapErr transforms Err and passes Ok through", () => {
    expect(mapErr(err("a"), (s) => s.toUpperCase())).toEqual(err("A"));
    const o = ok(1);
    expect(mapErr(o, (e: string) => e)).toBe(o);
  });

  it("andThen short-circuits on Err", () => {
    const f = (n: number) => (n > 0 ? ok(n * 2) : err("non-positive"));
    expect(andThen(ok(3), f)).toEqual(ok(6));
    expect(andThen(ok(-1), f)).toEqual(err("non-positive"));
    expect(andThen(err<string>("upstream"), f)).toEqual(err("upstream"));
  });

  it("unwrap throws on Err", () => {
    expect(unwrap(ok("v"))).toBe("v");
    expect(() => unwrap(err(new Error("boom")))).toThrow(/Result\.unwrap on Err: boom/);
  });

  it("unwrapOr returns fallback on Err", () => {
    expect(unwrapOr(ok(1), 99)).toBe(1);
    expect(unwrapOr(err("nope"), 99)).toBe(99);
  });

  it("match dispatches branches", () => {
    const r1 = match(ok(5), { ok: (v) => v + 1, err: (_e: string) => -1 });
    const r2 = match(err("x"), { ok: (_v: number) => 0, err: (e) => e.length });
    expect(r1).toBe(6);
    expect(r2).toBe(1);
  });

  it("trySync wraps throws as Err", () => {
    const ok1 = trySync(() => 1);
    expect(ok1).toEqual(ok(1));

    const fail = trySync(
      () => {
        throw new Error("boom");
      },
      (e) => (e instanceof Error ? e.message : "?"),
    );
    expect(fail).toEqual(err("boom"));
  });

  it("tryAsync wraps rejections as Err", async () => {
    const ok1 = await tryAsync(async () => 7);
    expect(ok1).toEqual(ok(7));

    const fail = await tryAsync(
      async () => {
        throw new Error("nope");
      },
      (e) => (e instanceof Error ? e.message : "?"),
    );
    expect(fail).toEqual(err("nope"));
  });
});
