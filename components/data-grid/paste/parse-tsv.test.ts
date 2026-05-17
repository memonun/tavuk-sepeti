/**
 * parse-tsv tests — Excel/Sheets clipboard formats encountered in the wild.
 * Covers the formats most likely to surface from a Turkish admin's
 * day-to-day usage: tab-delimited paste from Excel, semicolon-delimited
 * paste from TR Windows Excel, and embedded newlines/quotes.
 */
import { describe, expect, it } from "vitest";

import {
  parseClipboardTable,
  serializeClipboardTable,
} from "@/components/data-grid/paste/parse-tsv";

describe("parseClipboardTable", () => {
  it("parses simple TSV from Excel", () => {
    const input = "Ad\tSoyad\tTelefon\nAli\tYılmaz\t05321234567";
    const out = parseClipboardTable(input);
    expect(out.delimiter).toBe("\t");
    expect(out.rows).toEqual([
      ["Ad", "Soyad", "Telefon"],
      ["Ali", "Yılmaz", "05321234567"],
    ]);
  });

  it("normalizes CRLF line endings", () => {
    const input = "a\tb\r\nc\td\r\n";
    const out = parseClipboardTable(input);
    expect(out.rows).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("preserves quoted cells with embedded delimiters", () => {
    const input = '"first, last"\tsecond\nthird\tfourth';
    const out = parseClipboardTable(input);
    expect(out.rows[0]).toEqual(["first, last", "second"]);
  });

  it("preserves quoted cells with embedded newlines", () => {
    const input = '"line one\nline two"\tnext';
    const out = parseClipboardTable(input);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toEqual(["line one\nline two", "next"]);
  });

  it("handles escaped quotes inside quoted cells", () => {
    const input = '"He said ""hi"""\tnext';
    const out = parseClipboardTable(input);
    expect(out.rows[0]).toEqual(['He said "hi"', "next"]);
  });

  it("falls back to semicolon for TR Windows Excel CSV", () => {
    const input = "Ad;Soyad;Telefon\nAli;Yılmaz;05321234567";
    const out = parseClipboardTable(input);
    expect(out.delimiter).toBe(";");
    expect(out.rows[1]).toEqual(["Ali", "Yılmaz", "05321234567"]);
  });

  it("strips formula-injection guard apostrophe on read", () => {
    const input = "name\t'=SUM(A1:A2)\n";
    const out = parseClipboardTable(input);
    expect(out.rows[0]).toEqual(["name", "=SUM(A1:A2)"]);
  });

  it("flushes the trailing cell when input has no terminating newline", () => {
    const input = "a\tb";
    const out = parseClipboardTable(input);
    expect(out.rows).toEqual([["a", "b"]]);
  });

  it("returns empty for empty input", () => {
    const out = parseClipboardTable("");
    expect(out.rows).toEqual([]);
  });
});

describe("serializeClipboardTable", () => {
  it("round-trips simple data", () => {
    const data = [
      ["Ad", "Soyad"],
      ["Ali", "Yılmaz"],
    ];
    const tsv = serializeClipboardTable(data);
    expect(tsv).toBe("Ad\tSoyad\nAli\tYılmaz");
  });

  it("quotes cells containing tabs", () => {
    const data = [["a\tb", "c"]];
    const tsv = serializeClipboardTable(data);
    expect(tsv).toBe('"a\tb"\tc');
  });

  it("quotes cells containing newlines", () => {
    const data = [["line\nnext", "ok"]];
    const tsv = serializeClipboardTable(data);
    expect(tsv).toBe('"line\nnext"\tok');
  });

  it("doubles internal quotes", () => {
    const data = [['He said "hi"', "x"]];
    const tsv = serializeClipboardTable(data);
    expect(tsv).toBe('"He said ""hi"""\tx');
  });

  it("prefixes formula-leading cells with apostrophe", () => {
    const data = [["=SUM(A1)", "+1", "-2", "@cmd"]];
    const tsv = serializeClipboardTable(data);
    expect(tsv).toBe("'=SUM(A1)\t'+1\t'-2\t'@cmd");
  });

  it("round-trips formula cells back to their original via parse", () => {
    const original = [["=DANGER", "ok"]];
    const tsv = serializeClipboardTable(original);
    const back = parseClipboardTable(tsv);
    expect(back.rows).toEqual(original);
  });
});
