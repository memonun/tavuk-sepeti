// Compare the migration files in the repo with what the database has recorded.
//
//   SUPABASE_DB_URL=... node scripts/db/status.mjs [--out status.json] [--require-clean]
//
// Pending  = in the repo, not in the history table  → will be applied on merge.
// Orphans  = in the history table, not in the repo  → someone applied SQL by hand or from
//            a branch that never merged; informational, but it means history and repo drifted.
//
// Exit: 0 ok · 1 --require-clean and something is pending, or duplicate versions · 2 cannot reach the DB.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { versionOf } from "./changeset.mjs";

const DIR = "supabase/migrations";

export function computeStatus({ localFiles, appliedVersions }) {
  const applied = new Set(appliedVersions.map(String));
  const local = localFiles
    .map((file) => ({ file, version: versionOf(file) }))
    .filter((m) => m.version !== null)
    .sort((a, b) => a.version.localeCompare(b.version));

  const byVersion = new Map();
  for (const m of local) byVersion.set(m.version, [...(byVersion.get(m.version) ?? []), m.file]);
  const duplicates = [...byVersion.values()].filter((files) => files.length > 1);

  const localVersions = new Set(local.map((m) => m.version));
  return {
    total: local.length,
    pending: local.filter((m) => !applied.has(m.version)).map((m) => m.file),
    orphans: [...applied].filter((v) => !localVersions.has(v)).sort(),
    duplicates,
  };
}

export async function fetchAppliedVersions(pg, dbUrl) {
  const client = new pg.Client({
    connectionString: dbUrl,
    // Supabase terminates TLS at the pooler with a chain the runner does not carry; the URL
    // is the secret, same posture as the CLI's --db-url.
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30_000,
    statement_timeout: 30_000,
  });
  await client.connect();
  try {
    const r = await client.query("select version from supabase_migrations.schema_migrations");
    return r.rows.map((x) => String(x.version));
  } finally {
    await client.end();
  }
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    process.stderr.write("SUPABASE_DB_URL tanımlı değil (GitHub → Settings → Secrets → Actions).\n");
    process.exit(2);
  }
  const pg = (await import("pg")).default;
  let appliedVersions;
  try {
    appliedVersions = await fetchAppliedVersions(pg, dbUrl);
  } catch (error) {
    process.stderr.write(`Veritabanına ulaşılamadı veya geçmiş okunamadı: ${error.message}\n`);
    process.exit(2);
  }

  const localFiles = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql"));
  const status = computeStatus({ localFiles, appliedVersions });

  const outIdx = process.argv.indexOf("--out");
  if (outIdx !== -1) fs.writeFileSync(process.argv[outIdx + 1], JSON.stringify(status, null, 2));

  process.stdout.write(
    `Repo: ${status.total} migration · bekleyen: ${status.pending.length} · repoda olmayıp veritabanında kayıtlı: ${status.orphans.length}\n` +
      (status.pending.length ? status.pending.map((f) => `  bekliyor  ${f}`).join("\n") + "\n" : "") +
      (status.orphans.length ? status.orphans.map((v) => `  yetim     ${v}`).join("\n") + "\n" : ""),
  );

  if (status.duplicates.length > 0) {
    process.stderr.write(
      "Aynı sürümü paylaşan dosyalar (sadece biri çalışır):\n" +
        status.duplicates.map((files) => `  ${files.join("  ⇄  ")}`).join("\n") +
        "\n",
    );
    process.exit(1);
  }
  if (process.argv.includes("--require-clean") && status.pending.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] ?? "")).href) await main();
