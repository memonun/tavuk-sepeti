// Tiny, dependency-free SQL scanner for the migration linter.
//
// It does NOT parse SQL. It only does the two things a regex linter needs to be
// trustworthy:
//   1. mask(sql): blank out comments, string literals and $$ bodies WITHOUT moving
//      a single character, so a "drop table" inside a comment or a string never
//      triggers a rule, and line numbers still match the original file;
//   2. splitStatements(masked): cut the masked text at top-level semicolons.
//
// DO blocks are the one place where dangerous statements legitimately hide inside
// a $$ body, so extractDoBodies() hands those back (comments stripped, strings kept).

/** Replace a span with spaces, keeping newlines so line numbers survive. */
function blank(text) {
  return text.replace(/[^\n]/g, " ");
}

/**
 * Mask comments, string literals and dollar-quoted bodies.
 * Returns { masked, bodies } where bodies lists every dollar-quoted body
 * (start offset + raw text) so callers can opt back in to scanning them.
 */
export function mask(sql) {
  let out = "";
  const bodies = [];
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];

    // -- line comment
    if (c === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      out += blank(sql.slice(i, stop));
      i = stop;
      continue;
    }

    // /* block comment */ (Postgres allows nesting)
    if (c === "/" && next === "*") {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (sql[j] === "/" && sql[j + 1] === "*") {
          depth += 1;
          j += 2;
        } else if (sql[j] === "*" && sql[j + 1] === "/") {
          depth -= 1;
          j += 2;
        } else {
          j += 1;
        }
      }
      out += blank(sql.slice(i, j));
      i = j;
      continue;
    }

    // 'string' ('' escapes a quote)
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") {
          j += 1;
          break;
        } else j += 1;
      }
      out += "'" + blank(sql.slice(i + 1, Math.max(i + 1, j - 1))) + (j - 1 > i ? "'" : "");
      i = j;
      continue;
    }

    // $tag$ ... $tag$
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
      if (m) {
        const tag = m[0];
        const close = sql.indexOf(tag, i + tag.length);
        const bodyEnd = close === -1 ? n : close;
        bodies.push({ start: i + tag.length, text: sql.slice(i + tag.length, bodyEnd) });
        out += tag + blank(sql.slice(i + tag.length, bodyEnd)) + (close === -1 ? "" : tag);
        i = close === -1 ? n : close + tag.length;
        continue;
      }
    }

    // "quoted identifier" — keep (names matter), just skip past it intact
    if (c === '"') {
      const end = sql.indexOf('"', i + 1);
      const stop = end === -1 ? n : end + 1;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }

    out += c;
    i += 1;
  }

  return { masked: out, bodies };
}

/** Strip comments only (strings kept) — used to scan DO bodies. */
export function stripComments(sql) {
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    if (sql[i] === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? n : end;
    } else if (sql[i] === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
    } else {
      out += sql[i];
      i += 1;
    }
  }
  return out;
}

/** Split masked SQL at top-level semicolons. Each statement keeps its 1-based start line. */
export function splitStatements(masked) {
  const statements = [];
  let start = 0;
  let line = 1;
  let startLine = 1;
  let depth = 0;
  for (let i = 0; i < masked.length; i += 1) {
    const c = masked[i];
    if (c === "\n") line += 1;
    if (c === "(") depth += 1;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === ";" && depth === 0) {
      push(masked.slice(start, i), startLine);
      start = i + 1;
      startLine = line;
    }
  }
  push(masked.slice(start), startLine);
  return statements;

  function push(text, firstLine) {
    const trimmed = text.trim();
    if (trimmed === "") return;
    // Line of the first non-blank character, not of the previous semicolon.
    const leading = text.length - text.trimStart().length;
    const extra = (text.slice(0, leading).match(/\n/g) ?? []).length;
    statements.push({
      line: firstLine + extra,
      raw: trimmed,
      // lower-cased, whitespace-collapsed: what the rules actually match on
      norm: trimmed.toLowerCase().replace(/\s+/g, " "),
    });
  }
}

/** Table name as written → comparable key ("public.Foo" / "\"foo\"" → "foo"). */
export function tableKey(name) {
  return name
    .replace(/"/g, "")
    .replace(/^public\./i, "")
    .toLowerCase()
    .trim();
}
