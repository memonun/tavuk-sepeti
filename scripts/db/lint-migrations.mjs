// Lint the migrations a change adds, and check which migration files it touches.
//
//   node scripts/db/lint-migrations.mjs --base origin/main [--out lint.json] [--approved]
//   node scripts/db/lint-migrations.mjs --files 2026...sql,2026...sql   (deploy time: explicit list)
//
// Exit codes:  0 clean (warnings allowed)
//              1 errors — project rules broken, must be fixed
//              3 dangers — legal but destructive; needs human approval (--approved lets it pass)
//
// Only files the change ADDS are linted. The 100+ historical migrations predate these
// rules and are immutable, so they are never judged.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { checkChangeset } from "./changeset.mjs";
import { lintMigration } from "./lint-rules.mjs";

const DIR = "supabase/migrations";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function listFilesAt(ref) {
  const out = git("ls-tree", "--name-only", ref, `${DIR}/`);
  return out === "" ? [] : out.split("\n").map((f) => path.basename(f)).filter((f) => f.endsWith(".sql"));
}

function changesAgainst(base) {
  const out = git("diff", "--name-status", "-M", `${base}...HEAD`, "--", DIR);
  const change = { added: [], modified: [], deleted: [], renamed: [] };
  for (const line of out === "" ? [] : out.split("\n")) {
    const [status, a, b] = line.split("\t");
    const name = path.basename(a ?? "");
    if (!name.endsWith(".sql") && !(b && path.basename(b).endsWith(".sql"))) continue;
    if (status === "A") change.added.push(name);
    else if (status === "M") change.modified.push(name);
    else if (status === "D") change.deleted.push(name);
    else if (status.startsWith("R")) change.renamed.push({ from: name, to: path.basename(b) });
  }
  return change;
}

const filesArg = arg("files");
const base = arg("base", "origin/main");
const approved = arg("approved", false) === true || arg("approved") === "true";

let change;
let existing;
if (typeof filesArg === "string") {
  // Deploy time: the caller already knows exactly which files are pending.
  change = { added: filesArg.split(",").filter(Boolean), modified: [], deleted: [], renamed: [] };
  existing = [];
} else {
  change = changesAgainst(base);
  existing = listFilesAt(base);
}

const findings = checkChangeset({ ...change, existing }).map((f) => ({ ...f }));
for (const file of change.added) {
  const full = path.join(DIR, file);
  if (!fs.existsSync(full)) continue;
  for (const f of lintMigration({ file, sql: fs.readFileSync(full, "utf8") })) {
    findings.push({ ...f, file });
  }
}

const errors = findings.filter((f) => f.level === "error");
const dangers = findings.filter((f) => f.level === "danger");
const warnings = findings.filter((f) => f.level === "warning");

const result = {
  base: typeof filesArg === "string" ? null : base,
  changed: change.added.length + change.modified.length + change.deleted.length + change.renamed.length,
  added: change.added,
  errors,
  dangers,
  warnings,
  approved,
};

const out = arg("out");
if (typeof out === "string") fs.writeFileSync(out, JSON.stringify(result, null, 2));

const line = (f) => `  ${f.file ?? ""}:${f.line}  [${f.code}]  ${f.detail ?? f.snippet ?? ""}`;
process.stdout.write(
  `Migration kontrolü: ${change.added.length} yeni dosya.\n` +
    (errors.length ? `\nHATA (${errors.length}):\n${errors.map(line).join("\n")}\n` : "") +
    (dangers.length ? `\nTEHLİKELİ (${dangers.length}) — onay gerekir:\n${dangers.map(line).join("\n")}\n` : "") +
    (warnings.length ? `\nUyarı (${warnings.length}):\n${warnings.map(line).join("\n")}\n` : "") +
    (!errors.length && !dangers.length ? "\nSorun yok.\n" : ""),
);

if (errors.length > 0) process.exit(1);
if (dangers.length > 0 && !approved) process.exit(3);
process.exit(0);
