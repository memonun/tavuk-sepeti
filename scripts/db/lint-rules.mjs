// Migration lint rules. Pure: takes a file name + SQL text, returns findings.
// No git, no database, no filesystem — everything here is unit-tested with fixtures.
//
// Three severities:
//   error   — the migration breaks a project rule (CLAUDE.md §7) or cannot run; blocks.
//   danger  — the migration is legal but can destroy data or break the running site;
//             blocks UNTIL a person has read the explanation and approved (db-onayli).
//   warning — worth a look, never blocks.

import { mask, splitStatements, stripComments, tableKey } from "./sql-scan.mjs";

/** "uuid, p_x text default null, double precision" -> ["uuid","text","precision"]  (last token of each arg). */
export function argSignature(argList) {
  return splitTopLevel(argList)
    .map((a) =>
      a
        .replace(/^\s*(in|out|inout|variadic)\s+/i, "")
        .replace(/\s+default\s+.*$/i, "")
        .replace(/\s*=\s*.*$/, "")
        .trim()
        .split(/\s+/)
        .pop()
        ?.toLowerCase() ?? "",
    )
    .filter((t) => t !== "");
}

function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim() !== "") parts.push(cur);
  return parts;
}

function balancedArgs(norm, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < norm.length; i += 1) {
    if (norm[i] === "(") depth += 1;
    else if (norm[i] === ")") {
      depth -= 1;
      if (depth === 0) return norm.slice(openIdx + 1, i);
    }
  }
  return "";
}

export const FILENAME_RE = /^\d{14}_[a-z0-9_]+\.sql$/;

// `-- db-lint: allow no-grant` lets a migration opt out of ONE specific, explainable
// rule (e.g. a table that is deliberately locked to SECURITY DEFINER functions).
// RLS and the danger rules cannot be suppressed.
const SUPPRESSIBLE = new Set(["no-grant", "float", "search-path", "function-grant"]);

const NAME = String.raw`((?:"?[\w]+"?\.)?"?[\w]+"?)`;
const CREATE_TABLE_RE = new RegExp(String.raw`^create (?:unlogged )?table (?:if not exists )?${NAME}`);
const RLS_RE = new RegExp(String.raw`^alter table (?:if exists )?(?:only )?${NAME} (?:enable|force) row level security`);
const CREATE_FUNCTION_RE = new RegExp(String.raw`^create (?:or replace )?function ${NAME}\s*\(`);

function finding(level, code, line, extra = {}) {
  return { level, code, line, ...extra };
}

/** Which rules did the file opt out of? */
function suppressions(sql) {
  const out = new Set();
  for (const m of sql.matchAll(/--\s*db-lint:\s*allow\s+([a-z-]+)/g)) {
    if (SUPPRESSIBLE.has(m[1])) out.add(m[1]);
  }
  return out;
}

/** Split a comma list of table names from a GRANT/…ON clause. */
function grantedTables(norm) {
  // grant <privs> on [table] a, b, c to <roles>
  const m = /^grant .*? on (?:table )?(.+?) to (.+)$/.exec(norm);
  if (!m) return null;
  if (/^all tables in schema /.test(m[1])) return { all: true, roles: m[2] };
  return {
    all: false,
    tables: m[1].split(",").map((t) => tableKey(t)),
    roles: m[2],
  };
}

const DANGER_PATTERNS = [
  { code: "drop-table", re: /^drop table\b/ },
  { code: "drop-column", re: /\bdrop column\b/, tableOnly: true },
  { code: "drop-type", re: /^drop type\b/ },
  { code: "drop-schema", re: /^drop schema\b/ },
  { code: "drop-view", re: /^drop (?:materialized )?view\b/ },
  { code: "drop-sequence", re: /^drop sequence\b/ },
  { code: "truncate", re: /^truncate\b/ },
  { code: "alter-type", re: /\balter column [\w"]+ (?:set data )?type\b/ },
  { code: "set-not-null", re: /\balter column [\w"]+ set not null\b/ },
  { code: "rename", re: /^alter (?:table|function|type|view|materialized view|sequence|schema) .*\brename\b/ },
  { code: "disable-rls", re: /\bdisable row level security\b/ },
];

/** Danger codes found in ONE normalised statement (also used for DO bodies). */
export function dangersInStatement(norm) {
  const codes = [];
  for (const d of DANGER_PATTERNS) {
    if (d.re.test(norm)) codes.push(d.code);
  }
  if (/^delete from [\w."]+(?: (?:as )?\w+)?$/.test(norm) || (/^delete from /.test(norm) && !/\bwhere\b/.test(norm))) {
    codes.push("delete-all");
  }
  if (/^update [\w."]+ (?:as \w+ )?set /.test(norm) && !/\bwhere\b/.test(norm)) {
    codes.push("update-all");
  }
  // ADD COLUMN … NOT NULL with no DEFAULT: fails on existing rows, and the still-running
  // OLD code (which does not know the column) can no longer insert.
  if (/^alter table /.test(norm)) {
    for (const clause of norm.split(/\badd column\b/).slice(1)) {
      const head = clause.split(/,(?![^(]*\))/)[0] ?? clause;
      if (/\bnot null\b/.test(head) && !/\bdefault\b/.test(head) && !/\bgenerated\b/.test(head)) {
        codes.push("add-required-column");
      }
    }
  }
  return codes;
}

export function lintMigration({ file, sql }) {
  const findings = [];
  const allow = suppressions(sql);

  if (!FILENAME_RE.test(file)) {
    findings.push(
      finding("error", "bad-filename", 1, {
        detail: `Dosya adı "${file}" biçime uymuyor. Beklenen: 14 haneli tarih-saat + _ + küçük harfli ad (örn. 20261015093000_yeni_tablo.sql). pnpm db:new <ad> doğru adı üretir.`,
      }),
    );
  }

  const { masked, bodies } = mask(sql);
  const statements = splitStatements(masked);

  if (statements.length === 0) {
    findings.push(finding("warning", "empty", 1, { detail: "Dosyada çalışacak hiçbir SQL yok." }));
    return findings;
  }

  const createdTables = new Map(); // key -> line
  const rlsTables = new Set();
  const grantedAuth = new Set();
  let grantAllTables = false;
  const functions = [];
  const createdSignatures = new Set(); // "name(sig,sig)"
  const functionDrops = []; // { key, sig, line }
  const executeGrants = [];
  let revokesFromPublic = false;

  for (const st of statements) {
    const { norm, line } = st;

    // ---- tables ------------------------------------------------------------
    const ct = CREATE_TABLE_RE.exec(norm);
    if (ct) {
      const key = tableKey(ct[1]);
      if (!key.includes(".")) createdTables.set(key, line);
    }
    const rls = RLS_RE.exec(norm);
    if (rls) rlsTables.add(tableKey(rls[1]));

    if (/^grant /.test(norm)) {
      const g = grantedTables(norm);
      if (g) {
        const toApp = /\b(authenticated|anon|service_role)\b/.test(g.roles);
        if (toApp && g.all) grantAllTables = true;
        if (toApp && !g.all) for (const t of g.tables) grantedAuth.add(t);
      }
      const fn = /^grant execute on function ([\w."]+)/.exec(norm);
      if (fn) executeGrants.push(tableKey(fn[1]));
    }
    if (/^revoke .* on function /.test(norm) && /\bfrom public\b/.test(norm)) revokesFromPublic = true;

    // ---- column rules (create/alter table only) ------------------------------
    if (/^(create (unlogged )?table|alter table)\b/.test(norm)) {
      if (/\btimestamp\b(?!\s*(?:\(\d+\)\s*)?with time zone)(?!tz)/.test(norm.replace(/\btimestamp(?:\s*\(\d+\))?\s+with time zone\b/g, "timestamptz"))) {
        // "timestamp without time zone" and bare "timestamp" both land here.
        if (!/current_timestamp|\bdefault timestamp\b/.test(norm)) {
          findings.push(
            finding("error", "timestamp-without-tz", line, {
              detail: "Tarih/saat kolonu saat dilimsiz (timestamp). Proje kuralı: her zaman timestamptz.",
            }),
          );
        }
      }
      if (!allow.has("float")) {
        for (const m of norm.matchAll(/([\w"]+) (?:real|float4|float8|float|double precision)\b/g)) {
          if (/(price|amount|total|fee|cost|minor|tutar|fiyat|ucret|balance|paid)/.test(m[1])) {
            findings.push(
              finding("warning", "float-column", line, {
                detail: `"${m[1]}" kolonu ondalık (float). Para kuruş olarak bigint/numeric tutulmalı; float yuvarlama hatası yapar.`,
              }),
            );
          }
        }
      }
      // every FOREIGN KEY needs an explicit ON DELETE
      for (const m of norm.matchAll(/\breferences\s+[\w."]+\s*(?:\([^)]*\))?/g)) {
        const rest = norm.slice(m.index + m[0].length);
        const clause = rest.split(/,|\)\s*(?:;|$)/)[0] ?? rest;
        if (!/\bon delete\b/.test(clause)) {
          findings.push(
            finding("error", "fk-no-on-delete", line, {
              detail: `Yabancı anahtar (${m[0].trim()}) için "on delete cascade/restrict/set null" açıkça yazılmalı.`,
            }),
          );
        }
      }
    }

    // ---- statements that cannot run inside a transaction -----------------------
    if (/^(create|drop) (?:unique )?index concurrently\b/.test(norm) || /^create index .* concurrently\b/.test(norm) || /^vacuum\b/.test(norm)) {
      findings.push(
        finding("error", "non-transactional", line, {
          detail: "Bu komut (concurrently/vacuum) transaction içinde çalışmaz; migration'lar transaction içinde uygulanır.",
        }),
      );
    }
    if (/^(begin|commit|rollback|start transaction)$/.test(norm)) {
      findings.push(
        finding("warning", "explicit-transaction", line, {
          detail: "Migration zaten transaction içinde çalışır; begin/commit yazmaya gerek yok.",
        }),
      );
    }

    // ---- functions ----------------------------------------------------------------
    const dropFn = /^drop function (?:if exists )?([\w."]+)\s*(\()?/.exec(norm);
    if (dropFn) {
      const open = dropFn[2] ? norm.indexOf("(", dropFn[0].length - 1) : -1;
      functionDrops.push({
        key: tableKey(dropFn[1]),
        sig: open >= 0 ? argSignature(balancedArgs(norm, open)).join(",") : null,
        line,
        snippet: st.raw.slice(0, 160),
      });
    }

    const fnMatch = CREATE_FUNCTION_RE.exec(norm);
    if (fnMatch) {
      const open = norm.indexOf("(", fnMatch[0].length - 1);
      createdSignatures.add(`${tableKey(fnMatch[1])}(${argSignature(balancedArgs(norm, open)).join(",")})`);
      const definer = /\bsecurity definer\b/.test(norm);
      functions.push({ key: tableKey(fnMatch[1]), line, definer });
      if (definer && !/\bset search_path\b/.test(norm) && !allow.has("search-path")) {
        findings.push(
          finding("warning", "definer-no-search-path", line, {
            detail: `"${fnMatch[1]}" security definer ama "set search_path" yok; saldırgan şema ile kandırılabilir.`,
          }),
        );
      }
    }

    // ---- open policies ------------------------------------------------------------
    if (/^create policy /.test(norm) && /\b(using|with check) \(\s*true\s*\)/.test(norm)) {
      findings.push(
        finding("warning", "open-policy", line, {
          detail: "Politika koşulu 'true': satırları herkese açar. Bilerek mi?",
        }),
      );
    }
    if (/^grant .* to .*\banon\b/.test(norm) && !/\bselect\b/.test(norm.split(" on ")[0] ?? "")) {
      findings.push(
        finding("warning", "anon-write-grant", line, {
          detail: "Giriş yapmamış (anon) kullanıcıya yazma yetkisi veriliyor. Bilerek mi?",
        }),
      );
    }

    // ---- dangers ----------------------------------------------------------------------
    for (const code of dangersInStatement(norm)) {
      findings.push(finding("danger", code, line, { snippet: st.raw.slice(0, 160) }));
    }
    // revoke: tightening a FUNCTION (revoke execute … from public/anon — the usual companion
    // of a new security-definer function) is hardening, not a hazard. Taking table access
    // away from the app's own roles can lock the site out of its data.
    if (/^revoke\b/.test(norm)) {
      const onFunction = /\bon function\b/.test(norm);
      const fromApp = /\bfrom\b.*\b(authenticated|service_role)\b/.test(norm);
      if (!onFunction && fromApp) {
        findings.push(finding("danger", "revoke", line, { snippet: st.raw.slice(0, 160) }));
      }
    }
  }

  // DO blocks: the statements that matter live in the $$ body, which was masked.
  for (const body of bodies) {
    const before = masked.slice(0, body.start);
    const lastStatement = before.slice(before.lastIndexOf(";") + 1).trim().toLowerCase();
    if (!/^do\b/.test(lastStatement)) continue;
    const line = (sql.slice(0, body.start).match(/\n/g) ?? []).length + 1;
    // PL/pgSQL glues keywords onto statements ("begin drop table x", "then delete from y"),
    // so cut at those too before judging each piece.
    const pieces = stripComments(body.text).replace(/\b(begin|then|else|loop|declare)\b/gi, ";").split(";");
    for (const piece of pieces) {
      const norm = piece.trim().toLowerCase().replace(/\s+/g, " ");
      if (!norm) continue;
      for (const code of dangersInStatement(norm)) {
        findings.push(finding("danger", code, line, { snippet: `do $$ … ${norm.slice(0, 120)} … $$` }));
      }
    }
  }

  // A function dropped and re-created with the SAME argument types in the same file is the
  // normal way to change its return type or body — old callers keep working. Anything else
  // (new/removed arguments, or dropped for good) takes a signature away from running code:
  // exactly what stopped every order on 2026-08-19.
  for (const d of functionDrops) {
    const recreated = d.sig !== null && createdSignatures.has(`${d.key}(${d.sig})`);
    if (!recreated) findings.push(finding("danger", "drop-function", d.line, { snippet: d.snippet }));
  }

  // ---- file-level rules -----------------------------------------------------------------
  for (const [key, line] of createdTables) {
    if (!rlsTables.has(key)) {
      findings.push(
        finding("error", "no-rls", line, {
          detail: `"${key}" tablosu oluşturuluyor ama aynı dosyada "alter table ${key} enable row level security" yok. Proje kuralı: her tabloda RLS açık.`,
        }),
      );
    }
    if (!grantAllTables && !grantedAuth.has(key) && !allow.has("no-grant")) {
      findings.push(
        finding("error", "no-grant", line, {
          detail: `"${key}" tablosuna "grant select, insert, update, delete on table public.${key} to authenticated;" verilmemiş. Bu projede yeni tablolara otomatik yetki yok; grant olmadan uygulama "permission denied" alır.`,
        }),
      );
    }
  }
  for (const fn of functions) {
    if (fn.definer && !executeGrants.includes(fn.key) && !revokesFromPublic && !allow.has("function-grant")) {
      findings.push(
        finding("warning", "definer-no-grant", fn.line, {
          detail: `"${fn.key}" security definer fonksiyonu; kimin çalıştırabileceği (grant execute / revoke … from public) belirtilmemiş.`,
        }),
      );
    }
  }

  return findings.sort((a, b) => a.line - b.line);
}
